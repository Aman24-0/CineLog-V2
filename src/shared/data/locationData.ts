// src/shared/data/locationData.ts
//
// locationData — real country → searchable city dataset for the
// CineLog Profile location selector.
//
// DESIGN (Part 1 redesign — Country + City, NO State):
//   - Covers every country in COUNTRIES (countryLanguages.ts) so the
//     Profile selector works generically for all supported regions.
//   - Cities are a FLAT list per country (no state hierarchy). The
//     user types a city name and the list filters — like BookMyShow.
//     Searching "Rewa" returns Rewa directly, no state selection needed.
//   - Each country has its major cities (population centres, state
//     capitals, and notable towns). The list is NOT exhaustive (a
//     full city database for 20 countries would be megabytes) but
//     covers the cities a user is most likely to be in. Users in
//     unlisted towns can type their city name and if it's not in the
//     list, they can save it as a custom value (the UI supports
//     free-text entry for cities not in the dataset).
//   - The dataset is loaded synchronously (no network request on
//     every keystroke) and is small enough to bundle (~40KB).
//
// USAGE:
//   import { getCitiesForCountry, searchCities } from "~/shared/data/locationData";
//
//   const cities = getCitiesForCountry("IN"); // ["Mumbai", "Delhi", "Rewa", ...]
//   const results = searchCities("IN", "rew"); // ["Rewa"]
//
// SOURCE:
//   Wikipedia "List of cities in ..." articles + GeoNames for the
//   major cities. The data is hand-curated for accuracy and bundle
//   size. Adding a new country requires:
//     1. Adding it to COUNTRIES in countryLanguages.ts.
//     2. Adding its cities here.

/**
 * Get the full list of cities for a country (sorted alphabetically).
 * Returns `[]` if the country is not in the dataset.
 */
export function getCitiesForCountry(country: string): string[] {
  const cities = COUNTRY_CITIES[country];
  return cities ? [...cities].sort() : [];
}

/**
 * Search cities within a country by prefix or substring match.
 * Case-insensitive. Returns up to 20 results.
 * Used by the type-ahead city search input in the Profile settings.
 */
export function searchCities(country: string, query: string): string[] {
  const cities = COUNTRY_CITIES[country];
  if (!cities) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = cities.filter((c) => c.toLowerCase().includes(q));
  return results.slice(0, 20);
}

// ─── Dataset ────────────────────────────────────────────────────────
//
// Each country entry has its real major cities as a flat array.
// The list is NOT exhaustive but covers the major population centres
// + state capitals + notable towns for each country.

const COUNTRY_CITIES: Record<string, string[]> = {
  IN: [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata",
    "Pune", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur",
    "Nagpur", "Indore", "Bhopal", "Patna", "Vadodara", "Ghaziabad",
    "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot",
    "Varanasi", "Srinagar", "Aurangabad", "Dhanbad", "Amritsar",
    "Allahabad", "Ranchi", "Howrah", "Coimbatore", "Jabalpur",
    "Gwalior", "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota",
    "Guwahati", "Chandigarh", "Mysore", "Thiruvananthapuram",
    "Bhubaneswar", "Bareilly", "Saharanpur", "Gorakhpur",
    "Bhubaneswar", "Dehradun", "Noida", "Gurugram", "Rewa",
    "Ujjain", "Sikar", "Patiala", "Tiruchirappalli", "Salem",
    "Bhavnagar", "Hubli", "Belgaum", "Kozhikode", "Noida",
    "Warangal", "Tirupati", "Guntur", "Bokaro", "Durgapur",
    "Asansol", "Rourkela", "Nanded", "Kolhapur", "Ajmer",
    "Akola", "Gulbarga", "Jamnagar", "Udaipur", "Jhansi",
    "Tirunelveli", "Kottayam", "Mangalore", "Loni", "Aligarh",
    "Siliguri", "Jalgaon", "Kurnool", "Tirupur", "Gaya",
    "Bhiwandi", "Nagercoil", "Kakinada", "Panihati", "Bhagalpur"
  ],
  US: [
    "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
    "Philadelphia", "San Antonio", "San Diego", "Dallas",
    "San Jose", "Austin", "Jacksonville", "Fort Worth",
    "Columbus", "Charlotte", "San Francisco", "Indianapolis",
    "Seattle", "Denver", "Washington", "Boston", "El Paso",
    "Nashville", "Detroit", "Oklahoma City", "Portland",
    "Las Vegas", "Memphis", "Louisville", "Baltimore",
    "Milwaukee", "Albuquerque", "Tucson", "Fresno",
    "Sacramento", "Kansas City", "Mesa", "Atlanta", "Omaha",
    "Colorado Springs", "Raleigh", "Miami", "Long Beach",
    "Virginia Beach", "Oakland", "Minneapolis", "Tulsa",
    "Arlington", "Tampa", "New Orleans", "Wichita",
    "Cleveland", "Bakersfield", "Aurora", "Anaheim",
    "Honolulu", "Santa Ana", "Riverside", "Corpus Christi",
    "Lexington", "Stockton", "St. Louis", "Saint Paul",
    "Henderson", "Pittsburgh", "Cincinnati", "Anchorage",
    "Greensboro", "Plano", "Newark", "Lincoln", "Orlando",
    "Irvine", "Toledo", "Jersey City", "Chula Vista",
    "Durham", "Fort Wayne", "St. Petersburg", "Laredo",
    "Buffalo", "Madison", "Chandler", "Scottsdale",
    "Reno", "Norfolk", "Spokane", "Birmingham", "Boise",
    "Richmond", "San Bernardino", "Vancouver", "Rochester"
  ],
  GB: [
    "London", "Birmingham", "Manchester", "Leeds", "Sheffield",
    "Bradford", "Liverpool", "Bristol", "Newcastle upon Tyne",
    "Cardiff", "Belfast", "Glasgow", "Edinburgh", "Aberdeen",
    "Dundee", "Inverness", "Swansea", "Newport", "Nottingham",
    "Coventry", "Leicester", "Hull", "Plymouth", "Stoke-on-Trent",
    "Derby", "Southampton", "Portsmouth", "Brighton", "Reading",
    "Oxford", "Cambridge", "York", "Norwich", "Exeter",
    "Bath", "Canterbury", "Salisbury", "Carlisle", "Chester",
    "Durham", "Gloucester", "Lancaster", "Worcester",
    "Wolverhampton", "Sunderland", "Middlesbrough",
    "Bolton", "Blackburn", "Burnley", "Preston"
  ],
  CA: [
    "Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton",
    "Ottawa", "Mississauga", "Winnipeg", "Quebec City", "Hamilton",
    "Halifax", "Victoria", "Saskatoon", "Regina", "St. John's",
    "Kelowna", "Barrie", "Abbotsford", "Gatineau", "Kingston",
    "Moncton", "Thunder Bay", "Fredericton", "Prince George",
    "Sault Ste. Marie", "Brantford", "Guelph", "Lethbridge",
    "Nanaimo", "Red Deer", "Sarnia", "Medicine Hat",
    "Peterborough", "Chatham-Kent", "Kamloops", "Belleville",
    "North Bay", "Sault Ste. Marie", "Trois-Rivières",
    "Sherbrooke", "Drummondville", "Granby", "Joliette"
  ],
  AU: [
    "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide",
    "Gold Coast", "Newcastle", "Canberra", "Wollongong",
    "Sunshine Coast", "Hobart", "Geelong", "Townsville",
    "Cairns", "Darwin", "Toowoomba", "Ballarat", "Bendigo",
    "Albury", "Launceston", "Mackay", "Mandurah", "Coffs Harbour",
    "Rockhampton", "Bunbury", "Bundaberg", "Maitland",
    "Wagga Wagga", "Port Macquarie", "Tamworth", "Shepparton",
    "Mildura", "Dubbo", "Gladstone", "Hervey Bay"
  ],
  DE: [
    "Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt",
    "Stuttgart", "Düsseldorf", "Dortmund", "Essen", "Leipzig",
    "Bremen", "Dresden", "Nuremberg", "Hanover", "Freiburg",
    "Mannheim", "Karlsruhe", "Münster", "Wiesbaden", "Augsburg",
    "Kassel", "Mönchengladbach", "Braunschweig", "Chemnitz",
    "Aachen", "Kiel", "Magdeburg", "Oberhausen", "Lübeck",
    "Erfurt", "Halle", "Saarbrücken", "Potsdam", "Heidelberg",
    "Würzburg", "Regensburg", "Ingolstadt", "Wolfsburg",
    "Bonn", "Mainz"
  ],
  FR: [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes",
    "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes",
    "Reims", "Le Havre", "Saint-Étienne", "Toulon", "Grenoble",
    "Dijon", "Angers", "Nîmes", "Villeurbanne", "Le Mans",
    "Aix-en-Provence", "Brest", "Tours", "Amiens", "Limoges",
    "Annecy", "Boulogne-Billancourt", "Perpignan", "Metz",
    "Besançon", "Orléans", "Saint-Denis", "Argenteuil",
    "Rouen", "Mulhouse", "Caen", "Saint-Paul", "Nancy",
    "Tourcoing"
  ],
  JP: [
    "Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo",
    "Fukuoka", "Kobe", "Kyoto", "Kawasaki", "Saitama",
    "Hiroshima", "Sendai", "Kitakyushu", "Chiba", "Sakai",
    "Niigata", "Hamamatsu", "Shizuoka", "Okayama", "Kumamoto",
    "Kagoshima", "Matsuyama", "Kanazawa", "Matsudo",
    "Kawaguchi", "Ichikawa", "Funabashi", "Hachiōji",
    "Sagamihara", "Nagano", "Toyama", "Akita", "Naha",
    "Aomori", "Morioka", "Fukushima", "Mito", "Utsunomiya",
    "Maebashi", "Kōfu", "Gifu", "Tsu", "Ōtsu", "Wakayama",
    "Tottori", "Matsue", "Yamaguchi", "Tokushima", "Takamatsu",
    "Kōchi", "Saga", "Nagasaki", "Ōita", "Miyazaki"
  ],
  KR: [
    "Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju",
    "Ulsan", "Suwon", "Yongin", "Goyang", "Seongnam", "Cheongju",
    "Jeonju", "Cheonan", "Ansan", "Anyang", "Namyangju",
    "Pohang", "Uijeongbu", "Hwaseong", "Bucheon", "Gimhae",
    "Pyeongtaek", "Gumi", "Iksan", "Gunpo", "Suncheon",
    "Wonju", "Mokpo", "Jeju", "Changwon", "Chuncheon",
    "Chungju", "Gyeongju", "Gimpo", "Yangsan", "Andong",
    "Sejong"
  ],
  CN: [
    "Shanghai", "Beijing", "Guangzhou", "Shenzhen", "Tianjin",
    "Wuhan", "Dongguan", "Chengdu", "Foshan", "Nanjing",
    "Chongqing", "Shenyang", "Hangzhou", "Xi'an", "Harbin",
    "Suzhou", "Qingdao", "Dalian", "Zhengzhou", "Jinan",
    "Changchun", "Changsha", "Taiyuan", "Kunming", "Hefei",
    "Shijiazhuang", "Nanning", "Fuzhou", "Nanchang", "Guiyang",
    "Lanzhou", "Wuxi", "Xiamen", "Zhuhai", "Shantou",
    "Ningbo", "Wenzhou", "Tangshan", "Handan", "Datong"
  ],
  ES: [
    "Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza",
    "Málaga", "Murcia", "Palma", "Bilbao", "Alicante", "Córdoba",
    "Valladolid", "Vigo", "Gijón", "Granada", "Elche", "Oviedo",
    "Badalona", "Cartagena", "Terrassa", "Jerez de la Frontera",
    "Sabadell", "Mostoles", "Santa Cruz de Tenerife",
    "Pamplona", "Almería", "Alcalá de Henares", "San Sebastián",
    "Burgos", "Santander", "Castellón", "Albacete",
    "La Coruña", "Logroño", "Salamanca", "Cádiz", "León",
    "Tarragona", "Lérida", "Huelva"
  ],
  IT: [
    "Rome", "Milan", "Naples", "Turin", "Palermo", "Genoa",
    "Bologna", "Florence", "Bari", "Catania", "Venice",
    "Verona", "Messina", "Padua", "Trieste", "Brescia",
    "Parma", "Prato", "Taranto", "Modena", "Reggio Calabria",
    "Perugia", "Livorno", "Ravenna", "Cagliari", "Foggia",
    "Rimini", "Salerno", "Ferrara", "Sassari", "Latina",
    "Giugliano in Campania", "Monza", "Siracusa", "Pescara",
    "Bergamo", "Forlì", "Trento", "Vicenza", "Terni"
  ],
  BR: [
    "São Paulo", "Rio de Janeiro", "Salvador", "Brasília",
    "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba",
    "Recife", "Porto Alegre", "Belém", "Goiânia", "Campinas",
    "São Luís", "Maceió", "Natal", "Florianópolis",
    "Vitória", "Cuiabá", "Campo Grande", "João Pessoa",
    "Teresina", "Aracaju", "Porto Velho", "Macapá", "Rio Branco",
    "Palmas", "Boa Vista", "Guarulhos", "Osasco", "São Bernardo",
    "Santo André", "Jundiaí", "Niterói", "Sorocaba", "Ribeirão Preto"
  ],
  MX: [
    "Mexico City", "Guadalajara", "Monterrey", "Puebla",
    "Tijuana", "León", "Ciudad Juárez", "Zapopan",
    "Mérida", "Cancún", "Acapulco", "Querétaro", "San Luis Potosí",
    "Aguascalientes", "Hermosillo", "Saltillo", "Mexicali",
    "Culiacán", "Toluca", "Morelia", "Tuxtla Gutiérrez",
    "Torreón", "Veracruz", "Chihuahua", "Tlaquepaque",
    "Durango", "Tampico", "Ciudad Victoria", "Pachuca",
    "Oaxaca", "Campeche", "Zacatecas", "Colima", "La Paz",
    "Celaya", "Irapuato", "Ensenada"
  ],
  RU: [
    "Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg",
    "Nizhny Novgorod", "Kazan", "Chelyabinsk", "Omsk", "Samara",
    "Rostov-on-Don", "Ufa", "Krasnoyarsk", "Voronezh", "Perm",
    "Volgograd", "Krasnodar", "Saratov", "Tyumen", "Tolyatti",
    "Izhevsk", "Barnaul", "Ulyanovsk", "Irkutsk", "Khabarovsk",
    "Yaroslavl", "Vladivostok", "Makhachkala", "Tomsk", "Tver",
    "Kirov", "Nizhny Tagil", "Orenburg", "Surgut", "Penza",
    "Novokuznetsk", "Ryazan", "Astrakhan", "Naberezhnye Chelny",
    "Smolensk", "Kemerovo"
  ],
  AE: [
    "Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman",
    "Ras al-Khaimah", "Fujairah", "Khor Fakkan", "Dibba",
    "Madinat Zayed", "Ruwais", "Liwa", "Hatta"
  ],
  SA: [
    "Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar",
    "Tabuk", "Buraidah", "Khamis Mushait", "Hail", "Hofuf",
    "Mubarraz", "Taif", "Najran", "Yanbu", "Jubail", "Abha",
    "Arar", "Sakaka", "Jizan"
  ],
  TR: [
    "Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana",
    "Konya", "Gaziantep", "Mersin", "Diyarbakır", "Kayseri",
    "Eskişehir", "Samsun", "Denizli", "Şanlıurfa", "Malatya",
    "Trabzon", "Erzurum", "Van", "Manisa", "Sakarya", "Balıkesir",
    "Kahramanmaraş", "Aydın", "Hatay", "Tekirdağ", "Muğla",
    "Ordu", "Afyonkarahisar", "Çorum", "Edirne", "Kütahya"
  ],
  NL: [
    "Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven",
    "Tilburg", "Groningen", "Almere", "Breda", "Nijmegen",
    "Enschede", "Apeldoorn", "Haarlem", "Arnhem", "Amersfoort",
    "Zaanstad", "'s-Hertogenbosch", "Haarlemmermeer", "Zoetermeer",
    "Zwolle", "Leeuwarden", "Leiden", "Maastricht", "Delft"
  ],
  SE: [
    "Stockholm", "Gothenburg", "Malmö", "Uppsala", "Västerås",
    "Örebro", "Linköping", "Helsingborg", "Jönköping", "Norrköping",
    "Lund", "Umeå", "Gävle", "Borås", "Eskilstuna", "Södertälje",
    "Karlstad", "Täby", "Växjö", "Halmstad", "Sundsvall", "Luleå",
    "Trollhättan", "Östersund", "Borlänge", "Kalmar", "Falun"
  ]
};
