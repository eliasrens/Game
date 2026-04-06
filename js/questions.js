// Trivia questions organized by category
// Each category should have many questions (50+) for variety

const TRIVIA_CATEGORIES = [
  { id: 'blandat', name: 'Blandat', icon: '🎲' },
  { id: 'geografi', name: 'Geografi', icon: '🌍' },
  { id: 'vetenskap', name: 'Vetenskap', icon: '🔬' },
  { id: 'historia', name: 'Historia', icon: '📜' },
  { id: 'popkultur', name: 'Popkultur', icon: '🎬' },
  { id: 'fotboll', name: 'Fotboll', icon: '⚽' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'sverige', name: 'Sverige', icon: '🇸🇪' }
];

const QUESTIONS = {
  geografi: [
    { question: 'Vad är huvudstaden i Sverige?', options: ['Göteborg', 'Stockholm', 'Malmö', 'Uppsala'], correctAnswer: 1 },
    { question: 'Vilket land har flest invånare?', options: ['USA', 'Indien', 'Kina', 'Indonesien'], correctAnswer: 2 },
    { question: 'Vilken är världens minsta land?', options: ['Monaco', 'Vatikanstaten', 'San Marino', 'Liechtenstein'], correctAnswer: 1 },
    { question: 'I vilket land ligger Machu Picchu?', options: ['Mexiko', 'Colombia', 'Peru', 'Bolivia'], correctAnswer: 2 },
    { question: 'Vad heter den längsta floden i världen?', options: ['Amazonas', 'Nilen', 'Yangtze', 'Mississippi'], correctAnswer: 1 },
    { question: 'Vilket hav ligger mellan Europa och Amerika?', options: ['Stilla havet', 'Indiska oceanen', 'Atlanten', 'Norra ishavet'], correctAnswer: 2 },
    { question: 'Vad är huvudstaden i Australien?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], correctAnswer: 2 },
    { question: 'I vilket land ligger pyramiderna i Giza?', options: ['Marocko', 'Egypten', 'Libyen', 'Sudan'], correctAnswer: 1 },
    { question: 'Vilken stad kallas "Kärlekens stad"?', options: ['Rom', 'Venedig', 'Paris', 'Barcelona'], correctAnswer: 2 },
    { question: 'Vilken ö är världens största?', options: ['Madagaskar', 'Borneo', 'Grönland', 'Sumatra'], correctAnswer: 2 },
  ],
  vetenskap: [
    { question: 'Hur många ben har en spindel?', options: ['6', '8', '10', '12'], correctAnswer: 1 },
    { question: 'Vilken planet är närmast solen?', options: ['Venus', 'Mars', 'Merkurius', 'Jorden'], correctAnswer: 2 },
    { question: 'Vad är den kemiska beteckningen för vatten?', options: ['CO2', 'H2O', 'NaCl', 'O2'], correctAnswer: 1 },
    { question: 'Hur många tänder har en vuxen människa?', options: ['28', '30', '32', '34'], correctAnswer: 2 },
    { question: 'Vilken gas andas vi in mest av?', options: ['Syre', 'Kväve', 'Koldioxid', 'Helium'], correctAnswer: 1 },
    { question: 'Vad mäts i Kelvin?', options: ['Ljusstyrka', 'Temperatur', 'Tryck', 'Vikt'], correctAnswer: 1 },
    { question: 'Vilken planet är störst i vårt solsystem?', options: ['Saturnus', 'Neptunus', 'Jupiter', 'Uranus'], correctAnswer: 2 },
    { question: 'Vad kallas studien av fossiler?', options: ['Arkeologi', 'Paleontologi', 'Geologi', 'Biologi'], correctAnswer: 1 },
    { question: 'Hur snabbt rör sig ljus (ungefär)?', options: ['100 000 km/s', '300 000 km/s', '500 000 km/s', '1 000 000 km/s'], correctAnswer: 1 },
    { question: 'Vad har en bläckfisk tre stycken av?', options: ['Hjärnor', 'Hjärtan', 'Magar', 'Lungor'], correctAnswer: 1 },
  ],
  historia: [
    { question: 'Vilket år landade människan på månen?', options: ['1965', '1969', '1972', '1959'], correctAnswer: 1 },
    { question: 'Vem målade Mona Lisa?', options: ['Michelangelo', 'Rembrandt', 'Leonardo da Vinci', 'Picasso'], correctAnswer: 2 },
    { question: 'Vilket år föll Berlinmuren?', options: ['1987', '1989', '1991', '1985'], correctAnswer: 1 },
    { question: 'Vem uppfann telefonen?', options: ['Thomas Edison', 'Nikola Tesla', 'Alexander Graham Bell', 'Guglielmo Marconi'], correctAnswer: 2 },
    { question: 'Vilket land gav USA Frihetsgudinnan?', options: ['England', 'Frankrike', 'Spanien', 'Italien'], correctAnswer: 1 },
    { question: 'Hur länge varade hundraårskriget?', options: ['100 år', '116 år', '99 år', '150 år'], correctAnswer: 1 },
    { question: 'Vilken viking upptäckte Amerika?', options: ['Erik Röde', 'Leif Eriksson', 'Ragnar Lodbrok', 'Harald Blåtand'], correctAnswer: 1 },
    { question: 'I vilken stad hölls de första moderna OS?', options: ['Paris', 'London', 'Aten', 'Rom'], correctAnswer: 2 },
    { question: 'Vilken titel hade ledaren i det gamla Egypten?', options: ['Kung', 'Kejsare', 'Farao', 'Sultan'], correctAnswer: 2 },
    { question: 'Vad hette det första djuret i rymden?', options: ['Ham', 'Laika', 'Felix', 'Albert'], correctAnswer: 1 },
  ],
  popkultur: [
    { question: 'Vad heter Simbas pappa i Lejonkungen?', options: ['Scar', 'Mufasa', 'Rafiki', 'Zazu'], correctAnswer: 1 },
    { question: 'Vilken färg har Pac-Man?', options: ['Röd', 'Blå', 'Gul', 'Grön'], correctAnswer: 2 },
    { question: 'Hur många filmer finns det i Harry Potter-serien?', options: ['6', '7', '8', '9'], correctAnswer: 2 },
    { question: 'Vad heter huvudkaraktären i Zelda-spelen?', options: ['Zelda', 'Link', 'Ganon', 'Epona'], correctAnswer: 1 },
    { question: 'Vilken superhero är känd som "The Dark Knight"?', options: ['Superman', 'Batman', 'Spider-Man', 'Iron Man'], correctAnswer: 1 },
    { question: 'Vilket band spelade "Bohemian Rhapsody"?', options: ['The Beatles', 'Led Zeppelin', 'Queen', 'Pink Floyd'], correctAnswer: 2 },
    { question: 'Vilken Pokémon är nummer 1 i Pokédex?', options: ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle'], correctAnswer: 1 },
    { question: 'Hur många infinity stones finns det i Marvel?', options: ['4', '5', '6', '7'], correctAnswer: 2 },
    { question: 'I vilket land uppfanns pizzan?', options: ['Grekland', 'USA', 'Italien', 'Frankrike'], correctAnswer: 2 },
    { question: 'Vad heter den röda figuren i Among Us?', options: ['Red', 'Impostor', 'Crewmate', 'Den har inget namn'], correctAnswer: 3 },
  ],
  fotboll: [
    { question: 'Hur länge är en fotbollsmatch (ordinarie tid)?', options: ['80 min', '90 min', '100 min', '120 min'], correctAnswer: 1 },
    { question: 'Vilket land har vunnit flest fotbolls-VM?', options: ['Tyskland', 'Argentina', 'Brasilien', 'Italien'], correctAnswer: 2 },
    { question: 'Hur många spelare har ett lag på plan?', options: ['9', '10', '11', '12'], correctAnswer: 2 },
    { question: 'Vad heter VM-pokalen?', options: ['FIFA-pokalen', 'Ballon d\'Or', 'Champions Trophy', 'Jules Rimet'], correctAnswer: 0 },
  ],
  gaming: [
    { question: 'Vad heter huvudkaraktären i Zelda-spelen?', options: ['Zelda', 'Link', 'Ganon', 'Epona'], correctAnswer: 1 },
    { question: 'Vilken Pokémon är nummer 1 i Pokédex?', options: ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle'], correctAnswer: 1 },
    { question: 'Vilket spel utspelar sig i Night City?', options: ['Watch Dogs', 'Cyberpunk 2077', 'Deus Ex', 'GTA VI'], correctAnswer: 1 },
    { question: 'Vad heter den röda figuren i Among Us?', options: ['Red', 'Impostor', 'Crewmate', 'Den har inget namn'], correctAnswer: 3 },
  ],
  sverige: [
    { question: 'Vilken dag firas Sveriges nationaldag?', options: ['17 maj', '6 juni', '1 juni', '24 juni'], correctAnswer: 1 },
    { question: 'Vad heter Sveriges längsta flod?', options: ['Dalälven', 'Torneälven', 'Klarälven', 'Göta älv'], correctAnswer: 1 },
    { question: 'Hur många landskap har Sverige?', options: ['21', '25', '29', '18'], correctAnswer: 1 },
    { question: 'Vilken stad är Sveriges näst största?', options: ['Malmö', 'Uppsala', 'Göteborg', 'Linköping'], correctAnswer: 2 },
    { question: 'Vad heter den svenska valutan?', options: ['Euro', 'Krona', 'Mark', 'Franc'], correctAnswer: 1 },
  ],
};

// Get a random question from a specific category (or all if 'blandat')
function getQuestionFromCategory(categoryId) {
  if (!categoryId || categoryId === 'blandat') {
    return getRandomQuestion();
  }
  const questions = QUESTIONS[categoryId];
  if (!questions || questions.length === 0) return getRandomQuestion();
  const q = questions[Math.floor(Math.random() * questions.length)];
  const cat = TRIVIA_CATEGORIES.find(c => c.id === categoryId);
  return { ...q, category: cat?.name || categoryId };
}

// Get a random question from any category
function getRandomQuestion() {
  const allCategories = Object.keys(QUESTIONS);
  const catId = allCategories[Math.floor(Math.random() * allCategories.length)];
  const questions = QUESTIONS[catId];
  const q = questions[Math.floor(Math.random() * questions.length)];
  const cat = TRIVIA_CATEGORIES.find(c => c.id === catId);
  return { ...q, category: cat?.name || catId };
}
