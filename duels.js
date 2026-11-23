/* The Challenge: one-on-one with rounds. The heavy stuff (questions, words,
 * card rules) lives here instead of in the core, and a round is just an extra
 * list in the app state, so a match syncs along without a single extra call.
 * Winner gets 30 points, loser 10 - the app settles up by itself. */
(function () {
  const G = window.Galway;
  if (!G) return;

  const WON = 30;
  const LOST = 10;
  const DRAW = 15;
  const SPELL_SECONDS = 8;

  /* --------------------------------------------------------------- content */

  const TRIVIA = [
    ['Hoevele „stammen” bepaalden het middeleeuwse Galway?', ['Twaalf', 'Veertien', 'Zestien', 'Achtentwintig'], 1, 'Veertien koopmansfamilies hielden tot in de 19e eeuw politiek en handel in handen.'],
    ['Welke familie hoort NIET tot de Tribes of Galway?', ['Blake', 'Martin', 'Murphy', 'Skerrett'], 2, 'De stammen: Athy, Blake, Bodkin, Browne, D’Arcy, Deane, Font, French, Joyce, Kirwan, Lynch, Martin, Morris en Skerrett.'],
    ['Waar komt de naam „Tribes of Galway” oorspronkelijk vandaan?', ['Een middeleeuws gildestatuut', 'Een scheldwoord van Cromwells soldaten', 'Een 19e-eeuwse krantenkop', 'Een oldgaelisch woord voor gilde'], 1, 'Cromwells troepen zeiden „Tribes” als belediging; de families namen het uit trotserij over.'],
    ['Welke bijnaam draagt Galway, Iers: Cathair na dTreabh?', ['City of a Hundred Spires', 'Queen City of the West', 'The Gateway to the North', 'City of the Tribes'], 3, 'De bijnaam verwijst naar de veertien handelsfamilies uit de Hiberno-Normandische tijd.'],
    ['Welke zeevaarder zou in 1477 in Galway zijn geweest?', ['Sir Francis Drake', 'John Cabot', 'Christopher Columbus', 'Vasco Núñez de Balboa'], 2, 'Columbus bezocht Galway in 1477, mogelijk op weg naar IJsland of de Faeröer.'],
    ['Wie liet rond 1124 het fort Dún Gaillimhe bouwen?', ['Richard Mór de Burgh', 'De O’Brien-koning Muirchertach', 'Koning Hendrik II', 'Tairrdelbach Ua Conchobair, koning van Connacht'], 3, 'Dún Gaillimhe kwam in 1124 klaar als vlootbasis van Tairrdelbach Ua Conchobair.'],
    ['Aan wie dankt Eyre Square zijn naam?', ['De familie Eyre, die er een kasteel bouwde', 'Burgemeester Edward Eyre, die het terrein in 1710 schonk', 'Een 17e-eeuwse marktkoopman', 'De landmeter die de straten uitzette'], 1, 'Burgemeester Edward Eyre gaf het plein in 1710 officieel aan de stad.'],
    ['Waarnaar werd Eyre Square in 1965 officieel hernoemd?', ['Liam Mellows Memorial Park', 'Páirc na hÉireann', 'John F. Kennedy Memorial Park', 'Kennedy Memorial Green'], 2, 'Kennedy sprak er op 29 juni 1963; iedereen blijft Eyre Square zeggen.'],
    ['Welke ramp beschadigde de Spanish Arch in 1755 zwaar?', ['Een stadsbrand', 'Een bestorming door de O’Flahertys', 'De vloedgolf na de aardbeving van Lissabon', 'Een voorjaarsvloed op de Corrib'], 2, 'De tsunami na de aardbeving van Lissabon sloeg een deel van de kademuren weg.'],
    ['Wat geldt er voor Shop Street, de drukste straat van Galway?', ['Ze is naar een van de stammen vernoemd', 'Ze is de langste straat van Connacht', 'Ze is alleen ’s nachts autovrij', 'Ze is sinds eind jaren negentig voetgangersgebied'], 3, 'Sinds eind jaren 1990 helemaal voetgangersgebied; er staat ook het 16e-eeuwse Lynch’s Castle.'],
    ['Welke nonnen kwamen in 1920 naar Kylemore?', ['Cisterciënzers uit Clare', 'Kartuizers uit Frankrijk', 'Loretenessen uit Lissabon', 'Benedictinessen uit het beschoten Ypres'], 3, 'Kylemore Abbey werd in 1920 thuis voor Benedictinessen die uit België waren gevlucht.'],
    ['Welke streek in west-Galway is de grootste Gaeltacht van Ierland?', ['De Burren', 'Connemara', 'Iar-Mhaigh Eo', 'De Mourne-bergen'], 1, 'Connemara omvat het grootste deel van de Connacht-Ierse Gaeltacht.'],
    ['Hoe heet het nationale Ierstalige toneel, in 1928 in Galway opgericht?', ['Druid Theatre Company', 'Taibhdhearc na Gaillimhe', 'Abbey Theatre', 'Focus Theatre'], 1, 'An Taibhdhearc (1928); Druid pas in 1975 en speelt Engelstalig.'],
    ['Waar staat de kroon op een Claddagh-ring voor?', ['Liefde', 'Vriendschap', 'Trouw', 'Hoop'], 2, 'Hart is liefde, handen zijn vriendschap, kroon is trouw — uit vissersdorp Claddagh.'],
    ['Hoe ver legt de Corrib af van Lough Corrib tot de zee?', ['Ongeveer 95 km', 'Ongeveer 48 km', 'Ongeveer 6 km', 'Ongeveer 22 km'], 2, 'Zes kilometer: een van de kortste rivieren van Europa.'],
    ['Na de Shannon is welke rivier de waterrijkste van Ierland?', ['De Barrow', 'De Corrib', 'De Blackwater', 'De Erne'], 1, 'De Shannon voert ongeveer 208 m³/s af, ruwweg dubbel zo veel als de Corrib.'],
    ['Wat is bijzonder aan Lough Corrib, net ten noorden van Galway?', ['Het diepste meer van de Britse eilanden', 'Het grootste meer volledig binnen de Republiek', 'Een stuwmeer uit de jaren dertig', 'Het grootste meer van het hele eiland'], 1, '176 km²; alleen Lough Neagh is op het eiland groter.'],
    ['Hoe groot is Galway Bay bij benadering?', ['12 km lang, 4 km breed', '50 km lang, 10 tot 30 km breed', '130 km lang, 60 km breed', '30 km lang, overal even smal'], 1, 'Circa 50 km lang en 10-30 km breed, met de Aran-eilanden voor de ingang.'],
    ['Welke drie eilanden vormen de Aran-eilanden?', ['Inis Mór, Inis Meáin, Inis Oírr', 'Inishbofin, Inishturk, Clare Island', 'Inis Meáin, Arranmore, Inishturk', 'Inis Oírr, Inisglóra, Inishmaan'], 0, 'Samen zo’n 46 km² Ierstalige Gaeltacht; veerboten varen jaarrond vanuit Rossaveal.'],
    ['Hoe noemen de Galwayenaren de zeepromenade van Salthill?', ['The Long Walk', 'The Bay Terrace', 'The Strand Mile', 'The Prom'], 3, 'The Prom opende in 1856; de Blackrock Diving Tower ernaast dateert uit 1953.'],
    ['Wat is Cruinniú na mBád in Galway Bay?', ['Een race met traditionele hookerboten naar Kinvara', 'Een Iers zangfeest in An Cheathrú Rua', 'Een roeiregatta op de Corrib', 'Een oesterrace bij de Spanish Arch'], 0, 'Zwart-geschuurde Galway hookers met roodbruine zeilen racen naar Kinvara.'],
    ['In welk jaar vond het Galway International Arts Festival voor het eerst plaats?', ['1968', '1978', '1989', '2001'], 1, 'Eerste editie in 1978; inmiddels een van Ierlands grootste kunstfestivals.'],
    ['Hoeveel All-Ireland senior hurlingtitels heeft Galway?', ['Drie', 'Vijf', 'Acht', 'Twaalf'], 1, 'Vijf, de laatste in 2017 na 29 jaar wachten tegen Waterford.'],
    ['In welk jaar wonnen Galway’s voetballers voorlopig laatst de Sam Maguire Cup?', ['2015', '1998', '2001', '2009'], 2, 'Negen titels in totaal, de negende in 2001.'],
  ];

  /* All 10 to 20 letters, the kind you would never dare to write down in a pub. */
  const SPELLING = [
    ['millennium', 'mill- met dubbel l, dan -ennium met dubbel n', 1], ['verzekering', 'één k en één r: ver-ze-ke-ring', 1], ['verantwoord', 'woord met dubbel o, één w', 1], ['onmogelijk', 'on- + mogelijk: één m en één g', 1], ['onvoldoende', 'on- + voldoende: slechts één l', 1], ['desondanks', 'één woord met twee d’en: des + ondanks', 1], ['realiseren', 'met s, zoals realisatie; nooit met z', 1], ['communicatie', 'dubbel m in com-, dan -nicatie met i', 1], ['kwantiteit', 'k w vooraan, slot -teit als in kwaliteit', 1], ['uitdrukkelijk', 'druk + k: dubbel k, en -lijk met ij', 2], ['hoofdzakelijk', 'hoofd- met d, zakelijk met één a', 2], ['onmiddellijk', 'één m, maar wél dd en ll', 2], ['vermoedelijk', 'vermoeden met oe, dan -e-lijk', 2], ['vergunning', 'één g, dubbel n: vergun + ning', 2], ['vergissing', 'één g, dubbel s: vergis + sing', 2], ['verplichting', 'verplicht met -licht-, dan -iging', 2], ['verwachting', '-wacht- met cht, niet verwagting', 2], ['vernietiging', 'met -nie- en -tig, niet vernieling', 2], ['beschouwing', 'met sch en ou, net als beschouwen', 2], ['schijnbaar', 'schijn met ij, -baar met aa', 2], ['onbezonnen', 'van bezinnen: één z, dubbel n', 2], ['onmiskenbaar', 'mis + kenbaar, slot -baar', 2], ['paracetamol', 'geen h en geen s: para-ceta-mol', 2], ['verhuizing', 'verhuizen + ing: ui, z en twee i’en', 2], ['veroorzaken', 'van oorzaak: dubbel o én dubbel a', 3], ['vergiffenis', 'dubbel f, en -enis niet -nis', 3], ['verschrikkelijk', 'schrik met dubbel k, dan -kelijk', 3], ['verpletteren', 'dubbel p én dubbel t', 3], ['geschrokken', 'ge + schrokken: dubbel k', 3], ['orthografie', 'wél th, geen ph, en -grafie met f', 3], ['contextueel', 'x voor het ks-geluid, slot -ueel met ee', 3], ['transfusie', 'trans- met één n, slot -sie', 3], ['identificatie', 'met f in -ific-, dan -catie met tie', 3], ['desalniettemin', 'des + al + niettemin: twee t’en', 3], ['onafhankelijkheid', 'één n voor -ankelijk, slot -lijkheid', 3], ['verantwoordelijkheid', 'dubbel o, één w, dan -lijkheid', 3], ['onbehoorlijk', 'on + behoorlijk: dubbel o, slot -lijk', 3], ['onverbiddelijk', 'bidden met dubbel d, dan -e-lijk', 3], ['onbetwistbaar', 'zeldzaam cluster -tw-, dan -wist- en -baar', 3], ['onnavolgbaar', 'twee n’en, één v, zeldzaam -gbaar', 3],
  ];

  /* Rules as verified on the publishers’ and Wikipedia pages; the 1v1 column
   * says honestly what has to be bent for two players. */
  const CARDGAMES = [
    {
      naam: 'Take 5!',
      spelers: '2 tot 10',
      kaarten: '104 kaarten, 1 tot 104 met stierenkoppen',
      spel: 'Iedereen houdt 10 kaarten. Om beurt legt iedereen tegelijk een kaart bij een van de vier rijen; de rij met het kleinste verschil wint. Wordt een rij met een zesde kaart vol, dan pakt wie hem legde alle vijf liggende kaarten en zijn eigen kaart begint de nieuwe rij. Past een kaart in geen enkele rij, dan moet een hele rij worden opgepakt.',
      straf: 'Stieren per kaart: normaal 1, veelvoud van 5 = 2, veelvoud van 10 = 3, dubbele getallen (11, 22, 33) = 5, kaart 55 = 7. Wie incasseert telt die minpunten bij zijn veestapel.',
      einde: 'Ronde voor ronde optellen; wie 66 of meer stieren heeft houdt op en de minste wint.',
      eenTegenEen: 'Officieel vanaf 2 spelers — gewoon spelen dus.',
    },
    {
      naam: 'Coup',
      spelers: '2 tot 6',
      kaarten: '18 kaarten: 5 personages maal 3 plus 3 Court-kaarten',
      spel: 'Elke speler krijgt 2 influence-kaarten. Jeclaimt een actie van een personage dat je niet perse hebt: Duke pakt 3 munten, Captain 2 van één ander, Assassin betaalt 1 en laat een tegenstander een influence verliezen, Contessa redt je van een moord, otherwise 1 munt uit de bank.',
      straf: 'Iedereen mag elke claim uitdagen. Liegde de claimer, dan verliest die 1 influence; was het waar, dan verliest de uitdager er 1 en schuift de claimer zijn kaart onder de Court-deck.',
      einde: 'Wie beide influences kwijt is valt af; de laatste familie wint.',
      eenTegenEen: 'Vanaf 2 spelers officieel; met z’n tweeën is een uitdageen grote gok, dus bluffen maar.',
    },
    {
      naam: 'Wizard',
      spelers: '3 tot 6 (met z’n tweeën op huisregels)',
      kaarten: '52 speelkaarten plus 4 Wizards en 4 Narren',
      spel: 'Bied vooraf hoeveel slagen je haalt. Bovenste kaart van de stapel is troef; is die leeg of een Nar, dan geen troef. Wizards steken alles, Narren zijn lager dan alles wat geen Nar is.',
      straf: 'Exact geboden: 20 punten plus 10 per gehaalde slag. Fout geboden: 10 eraf per slag te veel of te weinig.',
      einde: 'Na alle rondes (bij 3 spelers 20, bij 6 spelers 10) wint de hoogste stand.',
      eenTegenEen: 'Officieel vanaf 3 spelers. Huisregel voor twee: geef elkaars twee biedingen door alsof je een third person playt, of gebruik 10 kaarten per ronde en dubbele biedingen.',
    },
  ];

  /* Average Galway pub prices in cents; the app only ever asks which of three
   * is the most expensive, so rough is good enough. */
  const MENU = [
    ['Pint lager', 570], ['Pint stout', 610], ['Pint IPA', 650], ['Halve pint cider', 460], ['Small lager', 420],
    ['Irish whiskey, dubbel', 820], ['Pint Murphy’s', 610], ['Guinness, pint', 610], ['Glas witte wijn', 620],
    ['Glas rode wijn', 640], ['Bowl prosecco', 1200], ['Gin & tonic', 790], ['Long island ice tea', 950],
    ['Softdrank', 340], ['Kop koffie', 340], ['Smoothie', 550], ['Hot whiskey', 700], ['Baileys', 640],
    ['Russel’s', 750], ['Vodka lemonade', 790], ['Pint Smithwick’s', 600], ['Wijntje huis', 520],
  ];

  /* Lines everyone thinks they do not know until they hear them. Quoted in the
   * English they were spoken, with three honest wrong answers next to them. */
  const QUOTES = [
    ['Zed’s dead, baby. Zed’s dead.', 'Pulp Fiction', ['Reservoir Dogs', 'Jackie Brown', 'From Dusk Till Dawn'], 'Butch Coolidge na het gevecht in het appartement'],
    ['I’m going to make him an offer he can’t refuse.', 'The Godfather', ['Goodfellas', 'Casino', 'Scarface'], 'Don Corleone bij de begrafenis van Bonasera'],
    ['Keep your friends close, but your enemies closer.', 'The Godfather Part II', ['The Godfather', 'Once Upon a Time in America', 'A Bronx Tale'], 'Michael tegen Tom Hagen over Fredo'],
    ['I’ll be back.', 'The Terminator', ['The Abyss', 'Total Recall', 'RoboCop'], 'Kyle Reese, voor het politiebureau'],
    ['Hasta la vista, baby.', 'Terminator 2: Judgment Day', ['The Running Man', 'True Lies', 'Die Hard 2'], 'De T-800 tegen een trucker'],
    ['Say hello to my little friend!', 'Scarface', ['Carlito’s Way', 'Casino', 'The Untouchables'], 'Tony Montana op het dak van zijn huis'],
    ['May the Force be with you.', 'Star Wars', ['Star Trek: The Motion Picture', 'Close Encounters of the Third Kind', 'Alien'], 'Om te zeggen tegen een pilotenbrigade'],
    ['No, I am your father.', 'The Empire Strikes Back', ['Return of the Jedi', 'Raiders of the Lost Ark', 'Dune'], 'De beroerdst geciteerde zin van de film'],
    ['You can’t handle the truth!', 'A Few Good Men', ['The Verdict', 'Michael Clayton', 'Primal Fear'], 'Kolonel Jessup op het getuigenbankje'],
    ['I see dead people.', 'The Sixth Sense', ['The Others', 'Stir of Echoes', 'Donnie Darko'], 'Cole tegen zijn psycholoog'],
    ['Here’s looking at you, kid.', 'Casablanca', ['Gilda', 'The Third Man', 'Notorious'], 'Rick, met een glas in de hand'],
    ['I’m the king of the world!', 'Titanic', ['Gone with the Wind', 'Ben-Hur', 'Doctor Zhivago'], 'Bovenop de boeg, na zessen'],
    ['Run, Forrest, run!', 'Forrest Gump', ['The Shawshank Redemption', 'Rudy', 'Jerry Maguire'], 'Op de achteras van een truck'],
    ['You shall not pass!', 'The Lord of the Rings: The Fellowship of the Ring', ['Harry Potter and the Philosopher’s Stone', 'Excalibur', 'Clash of the Titans'], 'Op de brug van Khazad-dûm'],
    ['Why so serious?', 'The Dark Knight', ['Joker', 'Fight Club', 'Se7en'], 'Met een mes en een glimlach'],
    ['We’re gonna need a bigger boat.', 'Jaws', ['The Perfect Storm', 'Deep Blue Sea', 'The Abyss'], 'Achter de ruit van de Orca'],
    ['I love the smell of napalm in the morning.', 'Apocalypse Now', ['Platoon', 'Full Metal Jacket', 'Deer Hunter'], 'Kolonel Kilgore na de aanval op het dorp'],
    ['There’s no place like home.', 'The Wizard of Oz', ['Mary Poppins', 'Singin’ in the Rain', 'The Red Shoes'], 'Drie keer draaien in de schoenen'],
    ['Frankly, my dear, I don’t give a damn.', 'Gone with the Wind', ['Rebecca', 'Sunset Boulevard', 'A Streetcar Named Desire'], 'Rhett Butler loopt de deur uit'],
    ['Nobody’s perfect.', 'Some Like It Hot', ['The Apartment', 'Sabrina', 'Charade'], 'De allerlaatste zin van de film'],
    ['Here’s Johnny!', 'The Shining', ['Psycho', 'Rosemary’s Baby', 'A Clockwork Orange'], 'Met een bijl door een deur'],
    ['You had me at hello.', 'Jerry Maguire', ['As Good as It Gets', 'When Harry Met Sally', 'Sleepless in Seattle'], 'Dorothy Boyd, halverwege een tirade'],
    ['To infinity and beyond!', 'Toy Story', ['A Bug’s Life', 'Shrek', 'Shark Tale'], 'Buzz Lightyear met één voet omhoog'],
    ['I’m just a girl, standing in front of a boy, asking him to love her.', 'Notting Hill', ['Four Weddings and a Funeral', 'High Fidelity', 'Love Actually'], 'Anna Scott geeft een persbericht'],
  ];

  /* Blind tasting: which of the two glasses is which. The person pouring knows,
   * both players have to taste. */
  const TASTINGS = [
    ['Guinness', 'Murphy’s', 'Je mag het zeggen, maar proef eerst'], ['Stout', 'Porter', 'Beiden donker; de een zoeter dan de ander'], ['Lager', 'Rode ale', 'Let op het broodachtige'], ['IPA', 'Pale ale', 'Bitter of bloemig?'], ['Cider', 'Peron', 'Zoet versus gistig'], ['Lager', 'Cider', 'Graan of appel'], ['Whiskey, oak', 'Whiskey, sherry', 'Vanille tegen rozijn'], ['Irish coffee', 'Hot whiskey', 'Waar zit de koffie?'], ['Rode wijn', 'Bourgondische warm', 'Koud of met kruiden'], ['Koffie', 'Thee met melk', 'Na drie glazen niet meer zeker'], ['Gin & tonic', 'Wodka lemonade', 'Jenever of citroen'], ['Smithwick’s', 'Stout', 'Rood versus zwart'], ['Witte wijn', 'Prosecco', 'Prik of niet'], ['Kwartje', 'Pint', 'Je proeft het verschil niet, maar let op je portemonnee'],
  ];

  const HITS = [
    'Zet een muziekzender op. Wie als eerste het volgende nummer noemt vóór het begint, wint de ronde.',
    'Speel een shuffle met Ierse hits. Wie de artiest van het volgende nummer raadt, wint.',
    'De dj zingt drie woorden van het volgende nummer; wie het hele nummer noemt vóór de zang, wint.',
    'Iemand neuriet twintig seconden. Wie het nummer raadt zonder dat het op de radio klinkt, wint.',
    'Laat de jukebox of Spotify-radio verrassen: wie eerst de artiest noemt, wint de ronde.',
    'Geef de telefoon rond: wie het nummer van de volgende DJ-tank raadt voordat de eerste regel voorbij is, wint.',
  ];

  const FRAMES = ['Stranger Things', 'The Crown', 'Wednesday', 'Narcos', 'Peaky Blinders', 'Breaking Bad', 'Game of Thrones', 'The Office', 'Friends', 'Squid Game', 'Dark', 'Lupin', 'Bridgerton', 'The Queen’s Gambit'];

  const TYPES = {
    trivia: { naam: 'Galway-trivia', instructie: 'Vraag, vier opties. Wie het eerst goed schreeuwt, krijgt de ronde.' },
    spellering: { naam: 'Spellering', instructie: 'Woord acht seconden kijken, dan verbloppen en letteren. Fout? Dan mag de ander overnemen.' },
    citaten: { naam: 'Filmcitaat', instructie: 'Een citaat, drie films. Wie hem het eerst heeft, wint.' },
    drank: { naam: 'Duurste drank', instructie: 'Drie dranken van de kaart. Wie de duurste raadt, wint de ronde.' },
    proeven: { naam: 'Blind proeven', instructie: 'Schänk twee gelijke glazen. Proeven, wijzen, geen geluid maken.' },
    hitster: { naam: 'Live hitster', instructie: 'Radio aan. Wie het eerst noemt wat er na komt, wint.' },
    frame: { naam: 'Netflix-frame', instructie: 'Pauzeer op het tijdstip en laat raden. Drie kansen, dan de ander.' },
    kaart: { naam: 'Kaartspel', instructie: 'Een potje met regels eronder. Wie wint, krijgt de ronde.' },
  };

  /* ------------------------------------------------------------- small tools */

  function state() {
    return G.state;
  }

  function duels() {
    if (!Array.isArray(state().duels)) state().duels = [];
    return state().duels;
  }

  function find(id) {
    return duels().find(duel => duel.id === id) || null;
  }

  function names(id) {
    const found = (state().players || []).find(player => player.id === id);
    return found ? found.name : 'iemand';
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const other = Math.floor(Math.random() * (i + 1));
      const held = copy[i];
      copy[i] = copy[other];
      copy[other] = held;
    }
    return copy;
  }

  function euro(cents) {
    return '€ ' + (cents / 100).toFixed(2).replace('.', ',');
  }

  function label(ronde) {
    return TYPES[ronde.type] || { naam: 'Ronde', instructie: '' };
  }

  function wins(duel, playerId) {
    return (duel.slagen || []).filter(ronde => ronde.winnaar === playerId).length;
  }

  function touch(duel) {
    duel.updatedAt = now();
    G.save();
  }

  /* Punten worden per wedstrijd precies één keer neergezet, en alleen als die
   * voorbij is. Beide telefoonen tekenen dezelfde stand op, dus een bronnaam
   * volstaat om dubbel uitbetalen te voorkomen zonder onderling te overleggen. */
  function settle(duel) {
    const [first, second] = duel.spelers;
    const voor = wins(duel, first);
    const achter = wins(duel, second);
    let changed = false;
    if (duel.status !== 'klaar' && (voor >= duel.doelen || achter >= duel.doelen)) {
      duel.status = 'klaar';
      duel.updatedAt = now();
      changed = true;
    }
    if (duel.status !== 'klaar') return null;
    const winner = voor === achter ? null : voor > achter ? first : second;
    const source = 'duel:' + duel.id;
    if (!(state().transactions || []).some(entry => entry.source === source)) {
      if (winner) {
        const loser = winner === first ? second : first;
        G.points([winner], WON, 'Wedstryd gewonnen van ' + names(loser), source);
        G.points([loser], LOST, 'Wedstryd verloren van ' + names(winner), source);
      } else {
        G.points(duel.spelers, DRAW, 'Gelijkspel in de Wedstryd', source);
      }
      changed = true;
    }
    if (changed) G.save();
    return winner;
  }

  /* ------------------------------------------------------------- new content */

  function content(type) {
    if (type === 'trivia') {
      const [vraag, opties, juist, feit] = pick(TRIVIA);
      return { vraag, opties, juist, feit };
    }
    if (type === 'spellering') {
      const [woord, hint, niveau] = pick(SPELLING);
      return { woord, hint, niveau };
    }
    if (type === 'citaten') {
      const [citaat, film, fouten, uitleg] = pick(QUOTES);
      const opties = shuffle([film].concat(fouten));
      return { vraag: citaat, opties, juist: opties.indexOf(film), feit: uitleg };
    }
    if (type === 'drank') {
      const drie = shuffle(MENU).slice(0, 3);
      let duurste = 0;
      drie.forEach((regel, index) => {
        if (regel[1] > drie[duurste][1]) duurste = index;
      });
      return { vraag: 'Welke van deze drie is het duurst?', prijzen: drie.map(regel => regel[1]), opties: drie.map(regel => regel[0]), juist: duurste, feit: 'Richtprijzen in Galway, bij benadering.' };
    }
    if (type === 'proeven') {
      const paar = pick(TASTINGS);
      return { paar: [paar[0], paar[1]], noot: paar[2] };
    }
    if (type === 'hitster') return { opdracht: pick(HITS) };
    if (type === 'frame') {
      const minuten = 1 + Math.floor(Math.random() * 55);
      const seconden = Math.floor(Math.random() * 60);
      return { titel: pick(FRAMES), tijd: minuten + ':' + String(seconden).padStart(2, '0') };
    }
    return { spel: pick(CARDGAMES) };
  }

  /* ------------------------------------------------------------- interface */

  let openId = null;
  let onthuld = false;
  let gekozen = null;
  let teller = null;
  let seconden = 0;

  function people(duel) {
    return duel.spelers.map(id => `<button class="secondary" onclick="duelWin('${duel.id}','${id}')">${esc(names(id))} wint de ronde</button>`).join('');
  }

  function score(duel) {
    return `<b>${esc(names(duel.spelers[0]))} ${wins(duel, duel.spelers[0])} — ${wins(duel, duel.spelers[1])} ${esc(names(duel.spelers[1]))}</b> <small class="muted">eerste bij ${duel.doelen}</small>`;
  }

  function choices(duel, ronde) {
    return ronde.opties
      .map((optie, index) => {
        if (!onthuld) return `<button class="secondary" onclick="duelChoose('${duel.id}','${ronde.id}',${index})">${esc(optie)}</button>`;
        const juist = index === ronde.juist ? ' · juist' : index === gekozen ? ' · jouw keuze, fout' : '';
        return `<p class="muted">${esc(optie)}${juist}</p>`;
      })
      .join('');
  }

  function roundCard(duel, ronde) {
    const type = label(ronde);
    const kop = `<div class="spread"><b>${esc(type.naam)}</b></div>`;

    if (ronde.opties) {
      const prijs = onthuld && ronde.prijzen ? `<p class="muted">${ronde.prijzen.map(euro).join(' · ')}</p>` : '';
      return `<section class="card">${kop}<p><b>${esc(ronde.vraag || '')}</b></p>${choices(duel, ronde)}${prijs}${onthuld ? `<p class="muted">${esc(ronde.feit || '')}</p>${people(duel)}` : `<p class="muted">${esc(type.instructie)}</p>`}</section>`;
    }

    if (ronde.type === 'spellering') {
      if (onthuld) return `<section class="card">${kop}<p style="font-size:1.5rem"><b>${esc(ronde.woord)}</b></p><p class="muted">${esc(ronde.hint)} · nog ${seconden}</p><button onclick="duelHide('${duel.id}','${ronde.id}')">Verberg, laat spellen</button></section>`;
      return `<section class="card">${kop}<p class="muted">${esc(type.instructie)}</p><button class="${ronde.verborgen ? 'secondary' : ''}" onclick="duelShow('${duel.id}')">${ronde.verborgen ? 'Toon nog eens' : 'Toon het woord (niveau ' + ronde.niveau + ')'}</button>${people(duel)}</section>`;
    }

    if (ronde.type === 'proeven') {
      return `<section class="card">${kop}<p><b>${esc(ronde.paar[0])}</b> of <b>${esc(ronde.paar[1])}</b>?</p><p class="muted">${esc(ronde.noot)}</p>${people(duel)}</section>`;
    }

    if (ronde.type === 'hitster') {
      return `<section class="card">${kop}<p>${esc(ronde.opdracht)}</p>${people(duel)}</section>`;
    }

    if (ronde.type === 'frame') {
      return `<section class="card">${kop}<p class="muted">${esc(type.instructie)}</p>${onthuld ? `<p><b>${esc(ronde.titel)}</b> op ${esc(ronde.tijd)}</p><p class="muted">Pauzeer daar en laat drie keer raden.</p>` : `<button onclick="duelReveal('${duel.id}')">Toon titel en tijdstip</button><p class="muted">Alleen voor wie de ander uitdaagt.</p>`}${people(duel)}</section>`;
    }

    const game = ronde.spel;
    return `<section class="card">${kop}<p><b>${esc(game.naam)}</b> · ${esc(game.spelers)} · ${esc(game.kaarten)}</p><p>${esc(game.spel)}</p><p class="muted">${esc(game.straf)}</p><p class="muted">${esc(game.einde)}</p><p><b>Met z’n tweeën:</b> ${esc(game.eenTegenEen)}</p>${people(duel)}</section>`;
  }

  function openRound(duel) {
    return (duel.slagen || []).filter(ronde => !ronde.winnaar).pop() || null;
  }

  function duelPage(duel) {
    const open = openRound(duel);
    const types = Object.keys(TYPES)
      .map(type => `<button class="secondary" onclick="duelRound('${duel.id}','${type}')">${esc(TYPES[type].naam)}</button>`)
      .join('');
    const history = (duel.slagen || []).slice(-8).reverse();
    const klaar = duel.status === 'klaar';
    const winner = settle(duel);
    return `<div class="spread"><h2>⚔️ ${esc(names(duel.spelers[0]))} — ${esc(names(duel.spelers[1]))}</h2>${btn('← Terug', 'duelBack()')}</div>`
      + card('Stand', `<div class="spread">${score(duel)}</div>${klaar ? `<p class="muted">${winner ? esc(names(winner)) + ' wint: +' + WON + ' punten, ' + esc(names(winner === duel.spelers[0] ? duel.spelers[1] : duel.spelers[0])) + ' krijgt +' + LOST + '.' : 'Gelijkspel: +' + DRAW + ' punten voor allebei.'}</p>${btn('Verwijder', "duelDelete('" + duel.id + "')", 'secondary')}` : btn('Afsluiten', "duelFinish('" + duel.id + "')", 'secondary')}`)
      + (open ? roundCard(duel, open) : card('Kies een ronde', `<p class="muted">Kies een soort ronde, of laat het lot beslissen.</p>${types}<button onclick="duelRound('${duel.id}','')">Verras me</button>`))
      + (history.length ? card('Recent', history.map(ronde => `<p class="muted">${esc(label(ronde).naam)} → ${ronde.winnaar ? esc(names(ronde.winnaar)) : 'nog open'}</p>`).join('')) : '');
  }

  function duelList() {
    duels();
    const players = state().players || [];
    const running = duels().filter(duel => duel.status !== 'klaar');
    const done = duels().filter(duel => duel.status === 'klaar').slice(-5).reverse();
    const rows = list => list
      .map(duel => {
        settle(duel);
        return `<div class="card spread"><span>${score(duel)}</span><button class="secondary" onclick="duelOpen('${duel.id}')">${duel.status === 'klaar' ? 'Bekijk' : 'Verder'}</button></div>`;
      })
      .join('');
    return `<div class="spread"><h2>⚔️ De Wedstryd</h2>${btn('← Terug', "sub('Meer')")}</div>`
      + (players.length < 2 ? card('Te weinig mensen', '<p class="muted">Zet eerst minstens twee spelers in de groep.</p>') : '')
      + (players.length < 2 ? '' : card('Nieuwe wedstryd', `<p class="muted">Jij speelt tegen een lotgenoot die de app aanwijst; eerste die drie rondes pakt wint de strijd en de punten.</p>${btn('Begin een wedstryd', 'duelNew()')}`))
      + (running.length ? rows(running) : card('Nog niets gespeeld', '<p class="muted">Een-op-een in rondes: Galway-trivia, spellering, blind proeven, een potje kaart, het duurste glas, een filmcitaat, een frame uit een serie of live hitster. Wie wint krijgt ' + WON + ' punten, wie verliest ' + LOST + '.</p>'))
      + (done.length ? card('Afgelopen', rows(done)) : '');
  }

  /* -------------------------------------------------------------- commands */

  window.duelNew = function () {
    const ids = (state().players || []).map(player => player.id);
    if (ids.length < 2) return toast('Voeg eerst twee spelers toe');
    const ik = localStorage.getItem('galway-current-player');
    const andere = ids.filter(id => id !== ik);
    const chosen = ik && ids.includes(ik) ? [ik, pick(andere.length ? andere : ids)] : shuffle(ids).slice(0, 2);
    const duel = { id: uid(), updatedAt: now(), spelers: chosen, doelen: 3, status: 'lopend', slagen: [] };
    duels().push(duel);
    touch(duel);
    openId = duel.id;
    onthuld = false;
    G.render();
    toast(names(chosen[0]) + ' tegen ' + names(chosen[1]));
    return undefined;
  };

  window.duelOpen = function (id) {
    openId = id;
    onthuld = false;
    gekozen = null;
    G.render();
    return undefined;
  };

  window.duelBack = function () {
    openId = null;
    clearInterval(teller);
    G.render();
    return undefined;
  };

  window.duelRound = function (id, type) {
    const duel = find(id);
    if (!duel) return undefined;
    const soort = type && TYPES[type] ? type : pick(Object.keys(TYPES));
    const ronde = Object.assign({ id: uid(), updatedAt: now(), type: soort, winnaar: null }, content(soort));
    duel.slagen = duel.slagen || [];
    duel.slagen.push(ronde);
    if (duel.status === 'klaar') {
      duel.status = 'lopend';
      G.clearPoints('duel:' + duel.id);
    }
    onthuld = false;
    gekozen = null;
    touch(duel);
    G.render();
    return undefined;
  };

  window.duelChoose = function (id, rondeId, index) {
    onthuld = true;
    gekozen = index;
    const duel = find(id);
    if (duel) settle(duel);
    G.render();
    return undefined;
  };

  /* The word is on screen for a handful of seconds and then gone: nobody gets
   * to read it off the screen while spelling. */
  window.duelShow = function (id) {
    onthuld = true;
    seconden = SPELL_SECONDS;
    clearInterval(teller);
    teller = setInterval(() => {
      seconden -= 1;
      if (seconden > 0) {
        G.render();
        return undefined;
      }
      clearInterval(teller);
      const open = openRound(find(id) || { slagen: [] });
      return duelHide(id, open && open.id);
    }, 1000);
    G.render();
    return undefined;
  };

  window.duelHide = function (id, rondeId) {
    clearInterval(teller);
    seconden = 0;
    onthuld = false;
    const duel = find(id);
    const ronde = duel && (duel.slagen || []).find(entry => entry.id === rondeId);
    if (ronde) ronde.verborgen = true;
    if (duel) touch(duel);
    G.render();
    toast('Tijd om te spellen');
    return undefined;
  };

  window.duelReveal = function (id) {
    onthuld = true;
    const duel = find(id);
    if (duel) settle(duel);
    G.render();
    return undefined;
  };

  window.duelWin = function (id, playerId) {
    const duel = find(id);
    const open = duel && openRound(duel);
    if (!open) return undefined;
    open.winnaar = playerId;
    open.updatedAt = now();
    onthuld = false;
    gekozen = null;
    clearInterval(teller);
    touch(duel);
    settle(duel);
    G.render();
    toast(names(playerId) + ' pakt de ronde');
    return undefined;
  };

  window.duelFinish = function (id) {
    const duel = find(id);
    if (!duel) return undefined;
    duel.status = 'klaar';
    touch(duel);
    settle(duel);
    G.render();
    return undefined;
  };

  window.duelDelete = function (id) {
    if (!confirm('Deze wedstryd en de punten ervoor weghalen?')) return undefined;
    state().duels = duels().filter(duel => duel.id !== id);
    G.clearPoints('duel:' + id);
    G.save();
    openId = null;
    G.render();
    return undefined;
  };

  /* ---------------------------------------------------------------- wiring */

  /* Het Meer-menu wordt door het basisbestand en de patch erovers telkens opnieuw
   * opgebouwd, dus de eigen rij wordt ná die opbouw tussen de andere gezelligheid
   * gezet — anders verdwijnt hij zodra iemand de lijst aanpast. */
  const priorMore = morePage;
  morePage = function () {
    if (more === 'Wedstryd') {
      const duel = openId && find(openId);
      return duel ? duelPage(duel) : duelList();
    }
    const pagina = priorMore.call(this);
    if (more !== 'Meer') return pagina;
    const kop = '<div class="card spread">';
    const rij = `<b>⚔️ De Wedstryd</b><button class="secondary" onclick="sub('Wedstryd')">Open →</button></div>`;
    const delen = pagina.split(kop);
    for (let i = 1; i < delen.length; i += 1) {
      if (delen[i].includes("sub('Scores')")) {
        delen.splice(i, 0, rij);
        return delen.join(kop);
      }
    }
    return pagina + kop + rij;
  };

  const priorPoints = pointsInfoPage;
  pointsInfoPage = function () {
    return priorPoints.call(this) + card('⚔️ Wedstryd', `<p><b>+${WON} punten</b> voor wie een wedstryd wint, <b>+${LOST}</b> voor wie verliest en <b>+${DRAW}</b> allebei bij gelijke stand.</p><p class="muted">Er wordt afgerekend zodra een van allebei drie rondes heeft gepakt. Daarna nog een ronde spelen mag gewoon; dan wordt er opnieuw afgerekend.</p>`);
  };
})();
