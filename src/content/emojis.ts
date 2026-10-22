/**
 * Palette d'émojis du compositeur (bouton « @ » des zones de texte) : catégories et mots-clés
 * (français et anglais) pour la recherche. Format compact : « émoji mots clés… », séparés par « | ».
 */
export interface EmojiGroup {
  key: string;
  label: string;
  icon: string;
  items: { e: string; k: string }[];
}

const parse = (s: string) =>
  s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(' ');
      return i < 0 ? { e: x, k: '' } : { e: x.slice(0, i), k: x.slice(i + 1).toLowerCase() };
    });

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    icon: 'emoticon-happy-outline',
    items: parse(
      '😀 sourire grin smile|😃 sourire joie happy|😄 rire joie laugh|😁 grand sourire grin|😆 rire laugh|😅 sueur rire sweat|🤣 mort de rire rofl|😂 larmes rire joy lol|🙂 sourire léger slight|🙃 à l’envers upside|😉 clin d’œil wink|😊 rougir blush|😇 ange innocent angel|🥰 amoureux love|😍 cœur yeux heart eyes|🤩 étoiles star struck|😘 bisou kiss|😋 miam yum|😛 langue tongue|😜 clin langue wink tongue|🤪 fou crazy zany|😝 langue tongue|🤑 argent money|🤗 câlin hug|🤭 oups giggle|🤫 chut shush|🤔 réfléchir think|🤐 bouche cousue zip|🤨 sourcil doute raised|😐 neutre neutral|😑 sans expression|😶 sans bouche silent|😏 narquois smirk|😒 blasé unamused|🙄 yeux au ciel eye roll|😬 grimace|😌 soulagé relieved|😔 pensif pensive|😪 sommeil sleepy|😴 dormir sleep|😷 masque malade mask|🤒 fièvre sick|🤕 blessé hurt|🤢 nausée nauseous|🤮 vomir vomit|🥵 chaud hot|🥶 froid cold|😵 étourdi dizzy|🤯 explosion tête mind blown|🤠 cowboy|🥳 fête party|😎 lunettes cool sunglasses|🤓 nerd intello|🧐 monocle|😕 confus confused|😟 inquiet worried|🙁 triste frown|😮 surpris wow|😯 étonné hushed|😲 stupéfait astonished|😳 gêné flushed|🥺 supplier pleading|😦 bouche ouverte|😧 angoissé anguished|😨 peur fearful|😰 anxieux anxious|😥 déçu sad relieved|😢 pleurer cry|😭 sanglots sob|😱 cri peur scream|😖 confus confounded|😣 persévérant|😞 déçu disappointed|😓 sueur froide|😩 fatigué weary|😫 épuisé tired|🥱 bâiller yawn|😤 vapeur triumph|😡 colère rage angry|😠 fâché angry|🤬 jurer cursing|😈 diable devil|👿 démon imp|💀 crâne skull dead|☠️ tête de mort|💩 caca poop|🤡 clown|👻 fantôme ghost|👽 alien|🤖 robot bot|😺 chat sourire cat|😸 chat rire|😹 chat larmes|😻 chat amour|😼 chat narquois|🙈 singe yeux monkey|🙉 singe oreilles|🙊 singe bouche',
    ),
  },
  {
    key: 'people',
    label: 'Gestes et personnes',
    icon: 'hand-wave-outline',
    items: parse(
      '👋 salut coucou wave hello|🤚 main levée|✋ stop main high five|🖖 vulcain|👌 ok parfait|🤌 pincée italien|🤏 un peu pinch|✌️ paix victoire peace|🤞 croiser doigts luck|🤟 je t’aime love you|🤘 rock metal|🤙 appelle call|👈 gauche left|👉 droite right|👆 haut up|👇 bas down|☝️ index point|👍 pouce oui like thumbs up|👎 pouce non dislike thumbs down|✊ poing fist|👊 coup de poing punch|🤛 check gauche|🤜 check droite|👏 applaudir clap bravo|🙌 hourra raise hands|👐 mains ouvertes|🤲 paumes|🤝 poignée de main deal handshake|🙏 merci prier please pray|✍️ écrire write|💅 vernis nails|💪 muscle fort strong|🧠 cerveau brain|👀 yeux regarder eyes|👁️ œil eye|👄 bouche|🫶 cœur mains heart hands|👶 bébé baby|🧒 enfant child|👦 garçon boy|👧 fille girl|🧑 personne person|👨 homme man|👩 femme woman|🧓 âgé old|👮 police|🕵️ détective spy|💂 garde|👷 ouvrier chantier construction|🤴 prince|👸 princesse|🦸 super-héros hero|🦹 méchant villain|🧙 magicien mage wizard|🧚 fée fairy|🧛 vampire|🧟 zombie|🧞 génie genie|🙋 lever la main question|🙅 non no|🙆 oui ok|💁 info|🤷 bof shrug|🤦 facepalm|🙇 s’incliner bow|🧑‍💻 développeur dev code|👨‍🍳 cuisinier chef|👩‍🎨 artiste artist|🧑‍🚀 astronaute|🏃 courir run|💃 danser dance|🕺 danse|👯 fête|🧘 yoga zen|🗣️ parler speak|👥 groupe membres members|👤 membre user',
    ),
  },
  {
    key: 'nature',
    label: 'Animaux et nature',
    icon: 'paw',
    items: parse(
      '🐶 chien dog|🐱 chat cat|🐭 souris mouse|🐹 hamster|🐰 lapin rabbit|🦊 renard fox|🐻 ours bear|🐼 panda|🐨 koala|🐯 tigre tiger|🦁 lion|🐮 vache cow|🐷 cochon pig|🐸 grenouille frog|🐵 singe monkey|🐔 poule chicken|🐧 pingouin penguin|🐦 oiseau bird|🦅 aigle eagle|🦉 hibou owl|🦇 chauve-souris bat|🐺 loup wolf|🐗 sanglier|🐴 cheval horse|🦄 licorne unicorn|🐝 abeille bee|🐛 chenille bug|🦋 papillon butterfly|🐌 escargot snail|🐞 coccinelle|🐢 tortue turtle|🐍 serpent snake|🦖 dinosaure t-rex|🐙 pieuvre octopus|🦀 crabe crab|🐠 poisson fish|🐬 dauphin dolphin|🐳 baleine whale|🦈 requin shark|🐊 crocodile|🐘 éléphant elephant|🦒 girafe|🐈 chat|🐕 chien|🌵 cactus|🎄 sapin noël tree|🌲 conifère|🌳 arbre tree|🌴 palmier palm|🌱 pousse sprout|🌿 herbe herb|☘️ trèfle|🍀 trèfle chance luck|🍁 érable automne|🍂 feuilles|🌷 tulipe|🌹 rose|🌻 tournesol sunflower|🌸 fleur cerisier blossom|🌼 fleur flower|🍄 champignon mushroom|🌍 terre monde earth world|🌙 lune moon|⭐ étoile star|🌟 étoile brillante glow|✨ étincelles sparkles|⚡ éclair zap lightning|🔥 feu fire hot|💧 goutte water|🌊 vague wave|☀️ soleil sun|⛅ nuage soleil|☁️ nuage cloud|🌧️ pluie rain|⛈️ orage storm|❄️ neige flocon snow|☃️ bonhomme de neige|🌈 arc-en-ciel rainbow|☔ parapluie',
    ),
  },
  {
    key: 'food',
    label: 'Nourriture',
    icon: 'food-apple-outline',
    items: parse(
      '🍏 pomme verte|🍎 pomme apple|🍐 poire|🍊 orange|🍋 citron lemon|🍌 banane banana|🍉 pastèque|🍇 raisin grapes|🍓 fraise strawberry|🍒 cerise cherry|🍑 pêche peach|🥭 mangue|🍍 ananas|🥥 noix de coco|🥝 kiwi|🍅 tomate|🥑 avocat|🥕 carotte|🌽 maïs corn|🌶️ piment|🥔 patate|🥐 croissant|🥖 baguette pain|🍞 pain bread|🧀 fromage cheese|🥚 œuf egg|🍳 cuisine|🥞 crêpes pancakes|🥓 bacon|🍗 poulet|🍖 viande|🌭 hot dog|🍔 burger|🍟 frites fries|🍕 pizza|🥪 sandwich|🌮 taco|🌯 burrito|🥗 salade|🍝 pâtes pasta|🍜 ramen nouilles|🍣 sushi|🍱 bento|🍤 crevette|🍩 donut|🍪 cookie biscuit|🎂 gâteau anniversaire birthday cake|🍰 part de gâteau|🧁 cupcake|🍫 chocolat|🍬 bonbon candy|🍭 sucette|🍿 popcorn|☕ café coffee|🍵 thé tea|🧃 jus|🥤 soda|🧋 bubble tea|🍺 bière beer|🍻 santé cheers|🥂 trinquer champagne|🍷 vin wine|🍸 cocktail|🧊 glaçon ice',
    ),
  },
  {
    key: 'activity',
    label: 'Activités',
    icon: 'soccer',
    items: parse(
      '⚽ foot football soccer|🏀 basket|🏈 football américain|⚾ baseball|🎾 tennis|🏐 volley|🏉 rugby|🎱 billard|🏓 ping-pong|🏸 badminton|🏒 hockey|🥅 but goal|⛳ golf|🎣 pêche|🥊 boxe|🥋 judo karaté|🎽 sport|🛹 skate|⛷️ ski|🏂 snowboard|🏋️ musculation|🚴 vélo|🏊 natation|🏆 trophée coupe trophy|🥇 or premier first gold|🥈 argent second|🥉 bronze troisième|🏅 médaille medal|🎖️ décoration|🎗️ ruban|🎫 ticket|🎟️ billet|🎪 cirque|🎭 théâtre|🎨 art peinture|🎬 film cinéma movie|🎤 micro chanter|🎧 casque musique headphones|🎼 partition|🎹 piano|🥁 batterie drum|🎷 saxophone|🎺 trompette|🎸 guitare|🎻 violon|🎲 dé jeu dice|♟️ échecs chess|🎯 cible objectif target|🎳 bowling|🎮 jeu vidéo manette game|🕹️ arcade joystick|🧩 puzzle|🎰 casino|🎉 fête confettis party tada|🎊 confettis|🎈 ballon balloon|🎁 cadeau gift|🎀 nœud|🪅 piñata|🎆 feu d’artifice fireworks|🎇 cierge|🧨 pétard',
    ),
  },
  {
    key: 'travel',
    label: 'Voyages et lieux',
    icon: 'airplane',
    items: parse(
      '🚗 voiture car|🚕 taxi|🚌 bus|🚑 ambulance|🚒 pompiers|🚓 police|🏎️ course|🏍️ moto|🚲 vélo bike|🛴 trottinette|🚂 train|🚆 train|🚇 métro|✈️ avion plane|🛫 décollage|🛬 atterrissage|🚀 fusée lancement rocket launch|🛸 ovni ufo|🚁 hélicoptère|⛵ voilier|🚢 bateau ship|⚓ ancre|⛽ essence|🚦 feu tricolore|🚧 travaux construction|🗺️ carte map|🧭 boussole compass|🏔️ montagne|🌋 volcan|🏕️ camping|🏖️ plage beach|🏝️ île island|🏠 maison home house|🏡 maison jardin|🏢 bureau building|🏥 hôpital|🏦 banque bank|🏨 hôtel|🏪 magasin|🏫 école school|🏰 château castle|🗼 tour|🗽 statue liberté|⛪ église|🕌 mosquée|⛩️ sanctuaire|🌆 ville city|🌃 nuit night|🌉 pont bridge|🎡 grande roue|🎢 montagnes russes|🗿 moai',
    ),
  },
  {
    key: 'objects',
    label: 'Objets',
    icon: 'lightbulb-outline',
    items: parse(
      '⌚ montre watch|📱 téléphone phone|💻 ordinateur laptop|⌨️ clavier keyboard|🖥️ écran desktop|🖨️ imprimante|🖱️ souris|💾 disquette save|💿 cd|📷 photo camera|📸 flash|🎥 caméra|📺 télé tv|📻 radio|🎙️ micro podcast|⏰ réveil alarm|⏳ sablier attente hourglass|⌛ temps|📡 antenne|🔋 batterie battery|🔌 prise plug|💡 idée ampoule idea|🔦 lampe|🕯️ bougie|🧯 extincteur|💸 argent dépense|💵 billet dollar|💰 sac argent money|💳 carte card|💎 diamant gem|⚖️ balance justice|🔧 clé outil tool wrench|🔨 marteau hammer|🛠️ outils tools|⚙️ engrenage réglages settings gear|🧱 brique|⛓️ chaîne|🧲 aimant|🔫 pistolet à eau|💣 bombe|🔪 couteau|🛡️ bouclier modération shield|🔮 boule de cristal|🧿 nazar|💈 barbier|🔭 télescope|🔬 microscope|💊 pilule|🩹 pansement|🧬 adn|🧪 test tube|🧹 balai|🧺 panier|🧻 papier|🚪 porte door|🛏️ lit|🛋️ canapé|🚽 toilettes|🛒 caddie shopping|🔑 clé key|🗝️ vieille clé|🔒 cadenas fermé lock|🔓 ouvert unlock|🔐 sécurisé|📦 colis paquet package|📫 boîte aux lettres|📮 poste|✉️ lettre mail|📧 email|📨 message entrant|📩 envoi|📤 envoyer outbox|📥 recevoir inbox|📝 note mémo memo|📄 document|📃 page|📑 onglets|📊 statistiques graphique chart|📈 hausse up trend|📉 baisse down|🗒️ bloc-notes|📅 calendrier date calendar|📆 agenda|🗓️ planning|📇 fichier|📋 presse-papiers clipboard|📌 punaise épingler pin|📍 position location|📎 trombone clip|✂️ ciseaux|🖊️ stylo pen|✏️ crayon pencil|🔍 loupe recherche search|📚 livres books|📖 livre ouvert book|🔖 marque-page|🏷️ étiquette tag|📜 parchemin règlement rules scroll|📰 journal news|🗞️ presse|📢 haut-parleur annonce announce megaphone|📣 mégaphone|🔔 cloche notification bell|🔕 muet|🎵 note musique|🎶 musique music',
    ),
  },
  {
    key: 'symbols',
    label: 'Symboles',
    icon: 'heart-outline',
    items: parse(
      '❤️ cœur rouge love heart|🧡 cœur orange|💛 cœur jaune|💚 cœur vert|💙 cœur bleu|💜 cœur violet|🖤 cœur noir|🤍 cœur blanc|🤎 cœur marron|💔 cœur brisé broken|❣️ cœur exclamation|💕 deux cœurs|💞 cœurs tournants|💓 cœur battant|💗 cœur grandissant|💖 cœur brillant|💘 cœur flèche|💝 cœur cadeau|✅ validé oui ok check done|☑️ case cochée|✔️ coche|❌ croix non erreur no x|❎ croix|➕ plus|➖ moins|➗ diviser|✖️ multiplier|❓ question|❔ question blanche|❗ exclamation important|❕ exclamation blanche|‼️ double exclamation|⁉️ exclamation question|⚠️ attention avertissement warning|🚫 interdit forbidden|⛔ sens interdit stop|📛 badge|🔞 18 ans|💯 cent parfait 100|🔴 rond rouge red|🟠 rond orange|🟡 rond jaune|🟢 rond vert green online|🔵 rond bleu blue|🟣 rond violet|⚫ rond noir|⚪ rond blanc|🟥 carré rouge|🟧 carré orange|🟨 carré jaune|🟩 carré vert|🟦 carré bleu|🟪 carré violet|⬛ carré noir|⬜ carré blanc|🔶 losange orange|🔷 losange bleu|🔺 triangle rouge|🔻 triangle bas|▶️ lecture play|⏸️ pause|⏹️ stop|⏺️ enregistrer|⏭️ suivant next|⏮️ précédent|🔁 répéter repeat|🔂 répéter une|🔀 aléatoire shuffle|🔄 actualiser refresh|⬆️ haut up|⬇️ bas down|⬅️ gauche left|➡️ droite right|↗️ haut droite|↘️ bas droite|↕️ haut bas|↔️ gauche droite|↩️ retour|🔃 recharger|🔙 retour back|🔛 on|🔝 top|🔜 bientôt soon|🆕 nouveau new|🆓 gratuit free|🆗 ok|🆙 up|🆒 cool|🔤 abc|#️⃣ dièse|0️⃣ zéro|1️⃣ un one|2️⃣ deux two|3️⃣ trois three|4️⃣ quatre four|5️⃣ cinq five|6️⃣ six|7️⃣ sept seven|8️⃣ huit eight|9️⃣ neuf nine|🔟 dix ten|ℹ️ information info|🔗 lien link|♻️ recyclage|⚜️ fleur de lys|🔱 trident|💠 diamant|🌀 cyclone|💤 dodo zzz|💢 colère|💥 boum collision|💫 étourdi|💬 bulle message chat|💭 pensée thought|🗯️ colère bulle|♾️ infini infinity|🏳️ drapeau blanc|🏴 drapeau noir|🏁 drapeau damier finish|🚩 drapeau rouge flag|🏳️‍🌈 arc-en-ciel fierté|🇫🇷 france|🇧🇪 belgique|🇨🇭 suisse|🇨🇦 canada|🇬🇧 royaume-uni|🇺🇸 états-unis|🇪🇸 espagne|🇩🇪 allemagne|🇮🇹 italie|🇵🇹 portugal|🇯🇵 japon|🇪🇺 europe',
    ),
  },
];

/** Recherche dans toute la palette (mots-clés français et anglais). */
export function searchEmojis(q: string): string[] {
  const s = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return [];
  const out: string[] = [];
  for (const g of EMOJI_GROUPS)
    for (const it of g.items) if (it.k.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(s) && !out.includes(it.e)) out.push(it.e);
  return out;
}
