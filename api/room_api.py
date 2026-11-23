"""Room sync API for the Galway trip app.

A deliberately small document store: one DynamoDB item per room holding the
whole trip state as a JSON string, guarded by an integer revision so that the
browser can do optimistic-concurrency merges.  The API never interprets the
state, it only stores and hands it back, which keeps every behaviour of the
app on the client and this service trivially reviewable.

Wire protocol (all bodies are JSON; every request needs the ``x-galway-key``
shared header, which stops drive-by writes on a public function URL):

    GET  /health            -> 200 {"ok": true}
    GET  /state?room=<id>   -> 200 {"rev": n, "updatedAt": iso, "state": {...}}
                               404 {"error": "empty-room"} when nothing is stored yet
    PUT  /state             <- {"room": id, "baseRev": n, "state": {...}}
                               201 {"rev": n}              stored
                               409 {"rev": n, "state": {}} newer copy exists, client merges and retries

Deployed by deploy/deploy.py; served locally by the matching stub in
lokale_testserver.py so local development needs no AWS account.
"""

from __future__ import annotations

import hmac
import json
import os
import re
import traceback
from datetime import datetime, timezone
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr

MAX_PAYLOAD_BYTES = 380_000  # DynamoDB caps an item at 400 KB; leave headroom.
ROOM_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
CORS_METHODS = "GET, PUT, OPTIONS"
CORS_HEADERS = "content-type, x-galway-key"

TABLE_NAME = os.environ["ROOM_TABLE"]
ROOM_KEY_PARAM = os.environ.get("ROOM_KEY_PARAM", "")
EMERGENCY_ROOM_KEY = os.environ.get("ROOM_KEY", "")  # escape hatch for local experiments
_cached_room_key: str | None = None
ALLOWED_ORIGINS = frozenset(
    origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()
)

_table = boto3.resource("dynamodb").Table(TABLE_NAME)
_unavailable = _table.meta.client.exceptions.ConditionalCheckFailedException


class HttpError(Exception):
    """A client error that maps straight onto an HTTP status."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.current: dict[str, Any] | None = None


def _header(event: dict[str, Any], wanted: str) -> str:
    for name, value in (event.get("headers") or {}).items():
        if name.lower() == wanted:
            return value or ""
    return ""


def _room_key() -> str:
    """Read the shared room key from SSM once per container and keep it."""
    global _cached_room_key
    if _cached_room_key is None:
        if EMERGENCY_ROOM_KEY:
            _cached_room_key = EMERGENCY_ROOM_KEY
        else:
            value = boto3.client("ssm").get_parameter(Name=ROOM_KEY_PARAM, WithDecryption=True)
            _cached_room_key = value["Parameter"]["Value"]
    return _cached_room_key


def _authorise(event: dict[str, Any]) -> None:
    if not hmac.compare_digest(_header(event, "x-galway-key"), _room_key()):
        raise HttpError(403, "missing or wrong x-galway-key")


def _body(event: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = json.loads(event.get("body") or "")
    except ValueError as error:
        raise HttpError(400, f"body is not valid JSON: {error}") from error
    if not isinstance(parsed, dict):
        raise HttpError(400, "body must be a JSON object")
    return parsed


def _room_id(event: dict[str, Any]) -> str:
    params = event.get("queryStringParameters") or {}
    from_body = str(_body(event).get("room", "")) if event.get("httpMethod") == "PUT" else ""
    room = (params.get("room") or from_body).strip().lower()
    if not ROOM_PATTERN.fullmatch(room):
        raise HttpError(400, "room must match ^[a-z0-9][a-z0-9-]{0,39}$")
    return room


def _read(room: str) -> dict[str, Any]:
    item = _table.get_item(Key={"room": room}).get("Item")
    if item is None:
        raise HttpError(404, "empty-room")
    return item


def _conflict(room: str) -> HttpError:
    error = HttpError(409, "revision conflict")
    error.current = _read(room)
    return error


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _create(room: str, payload: str) -> int:
    """Write revision 1; a room that already exists comes back as a conflict.

    This has to be a put: DynamoDB evaluates the condition of an UpdateItem
    against the item it is about to write, and the key attribute always exists
    there, so 'room does not exist' could never hold.
    """
    try:
        _table.put_item(
            Item={"room": room, "rev": 1, "payload": payload, "updatedAt": _stamp()},
            ConditionExpression=Attr("room").not_exists(),
        )
    except _unavailable as error:
        raise _conflict(room) from error
    return 1


def _replace(room: str, base_rev: int, payload: str) -> int:
    """Overwrite the room, but only while nobody else has bumped the revision."""
    return _apply(
        room,
        UpdateExpression="SET rev = rev + :one, payload = :payload, updatedAt = :now",
        ConditionExpression=Attr("rev").eq(base_rev),
        ExpressionAttributeValues={":one": 1, ":payload": payload, ":now": _stamp()},
    )


def _apply(room: str, **request: Any) -> int:
    """Run one conditional update and report the revision it landed on."""
    try:
        result = _table.update_item(Key={"room": room}, ReturnValues="UPDATED_NEW", **request)
    except _unavailable as error:
        raise _conflict(room) from error
    return int(result["Attributes"]["rev"])


def _read_state(event: dict[str, Any]) -> dict[str, Any]:
    item = _read(_room_id(event))
    return {
        "rev": int(item["rev"]),
        "updatedAt": item.get("updatedAt", ""),
        "state": json.loads(item["payload"]),
    }


def _write_state(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    room = _room_id(event)
    state = body.get("state")
    if not isinstance(state, dict):
        raise HttpError(400, "state must be an object")
    base_rev = body.get("baseRev", 0)
    if not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 0:
        raise HttpError(400, "baseRev must be a non-negative integer")

    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode()) > MAX_PAYLOAD_BYTES:
        raise HttpError(413, f"state is too large for one room ({len(payload.encode())} bytes)")

    rev = _create(room, payload) if base_rev == 0 else _replace(room, base_rev, payload)
    return {"rev": rev}


def _reply(status: int, body: Any, origin: str) -> dict[str, Any]:
    headers = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-methods": CORS_METHODS,
        "access-control-allow-headers": CORS_HEADERS,
        "access-control-max-age": "600",
    }
    if origin in ALLOWED_ORIGINS:
        headers["access-control-allow-origin"] = origin
        headers["vary"] = "origin"
    return {
        "statusCode": status,
        "headers": headers,
        "body": body if isinstance(body, str) else json.dumps(body, ensure_ascii=False),
        "isBase64Encoded": False,
    }


def handler(event: dict[str, Any], _context: Any = None) -> dict[str, Any]:
    """Route one Function URL request; every failure leaves as a JSON problem."""
    origin = _header(event, "origin")
    # A function URL sends payload format 2, where path and verb live under
    # requestContext.http; httpMethod and path are the older API Gateway shape.
    http = (event.get("requestContext") or {}).get("http") or {}
    path = http.get("path") or event.get("path") or ""
    method = event.get("httpMethod") or http.get("method") or "GET"
    if method == "OPTIONS":
        return _reply(204, "", origin)
    try:
        _authorise(event)
        if path.endswith("health"):
            return _reply(200, {"ok": True}, origin)
        if path.endswith("state"):
            if method == "GET":
                return _reply(200, _read_state(event), origin)
            if method == "PUT":
                return _reply(201, _write_state(event), origin)
        raise HttpError(404, "unknown path")
    except HttpError as error:
        if error.current is not None:
            item = error.current
            body = {"rev": int(item["rev"]), "updatedAt": item.get("updatedAt", ""), "state": json.loads(item["payload"])}
            return _reply(error.status, body, origin)
        return _reply(error.status, {"error": error.message}, origin)
    except Exception:  # noqa: BLE001 - never leak a traceback into a public URL
        print(json.dumps({"level": "ERROR", "message": "functie mislukt", "path": path, "method": method}))
        traceback.print_exc()
        return _reply(500, {"error": "internal error"}, origin)
