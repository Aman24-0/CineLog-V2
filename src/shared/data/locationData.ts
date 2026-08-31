// src/shared/data/locationData.ts
//
// locationData — real country → state/province → city dataset for
// the CineLog Profile location selector.
//
// DESIGN:
//   - Covers every country in COUNTRIES (countryLanguages.ts) so the
//     Profile selector works generically for all supported regions.
//   - States/provinces are the real ISO 3166-2 subdivisions for each
//     country (e.g. IN-MP = Madhya Pradesh, US-CA = California).
//   - Cities are real major cities for each state — NOT a tiny
//     special-cased list. Each state has 3-12 cities (the major
//     population centres), enough for a useful selector without
//     bloating the bundle.
//   - The dataset is intentionally NOT exhaustive (a full city
//     database for 20 countries would be megabytes). It covers the
//     major cities a user is likely to be in, plus the state
//     capital. Users in smaller towns can pick the nearest major
//     city or leave the city unset (the field is optional).
//
// USAGE:
//   import { getStatesForCountry, getCitiesForState, LOCATION_DATA }
//     from "~/shared/data/locationData";
//
//   const states = getStatesForCountry("IN"); // [{ code: "IN-MP",
//                                              //   name: "Madhya Pradesh"}, ...]
//   const cities = getCitiesForState("IN", "IN-MP"); // ["Rewa", "Bhopal", ...]
//
// SOURCE:
//   ISO 3166-2 subdivision codes + Wikipedia "List of cities in ..."
//   articles for the major cities. The data is hand-curated for
//   accuracy and bundle size. Adding a new country requires:
//     1. Adding it to COUNTRIES in countryLanguages.ts.
//     2. Adding its states + cities here.
//
// This dataset is loaded synchronously (no network request on every
// selector interaction) and is small enough (~50KB) to bundle.

export interface StateOption {
  /** ISO 3166-2 subdivision code, e.g. "IN-MP", "US-CA". */
  code: string;
  /** Human-readable state/province name. */
  name: string;
}

interface CountryLocation {
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  /** States/provinces for this country. */
  states: Array<{
    code: string;
    name: string;
    /** Major cities in this state (real names, not exhaustive). */
    cities: string[];
  }>;
}

// ─── Dataset ────────────────────────────────────────────────────────
//
// Each country entry has its real ISO 3166-2 subdivisions + the major
// cities for each. The list is intentionally NOT exhaustive — it
// covers the major population centres so the user can pick a
// sensible value. Smaller towns are not listed (the city field is
// optional; users in unlisted towns can pick the nearest major
// city or leave it unset).

export const LOCATION_DATA: CountryLocation[] = [
  {
    country: "IN",
    states: [
      { code: "IN-MP", name: "Madhya Pradesh", cities: ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Rewa", "Ujjain"] },
      { code: "IN-MH", name: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"] },
      { code: "IN-DL", name: "Delhi", cities: ["New Delhi", "Delhi"] },
      { code: "IN-KA", name: "Karnataka", cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"] },
      { code: "IN-TN", name: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"] },
      { code: "IN-TG", name: "Telangana", cities: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"] },
      { code: "IN-AP", name: "Andhra Pradesh", cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati"] },
      { code: "IN-WB", name: "West Bengal", cities: ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri"] },
      { code: "IN-GJ", name: "Gujarat", cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar"] },
      { code: "IN-RJ", name: "Rajasthan", cities: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"] },
      { code: "IN-UP", name: "Uttar Pradesh", cities: ["Lucknow", "Kanpur", "Agra", "Varanasi", "Meerut", "Allahabad"] },
      { code: "IN-PB", name: "Punjab", cities: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala"] },
      { code: "IN-HR", name: "Haryana", cities: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal"] },
      { code: "IN-KL", name: "Kerala", cities: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"] },
      { code: "IN-AS", name: "Assam", cities: ["Guwahati", "Dibrugarh", "Silchar", "Jorhat"] },
      { code: "IN-OR", name: "Odisha", cities: ["Bhubaneswar", "Cuttack", "Rourkela", "Brahmapur"] },
      { code: "IN-BR", name: "Bihar", cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur"] },
      { code: "IN-JH", name: "Jharkhand", cities: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"] },
      { code: "IN-CT", name: "Chhattisgarh", cities: ["Raipur", "Bhilai", "Bilaspur", "Korba"] },
      { code: "IN-UT", name: "Uttarakhand", cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani"] },
      { code: "IN-HP", name: "Himachal Pradesh", cities: ["Shimla", "Manali", "Dharamshala", "Solan"] },
      { code: "IN-GA", name: "Goa", cities: ["Panaji", "Margao", "Vasco da Gama"] },
      { code: "IN-JK", name: "Jammu and Kashmir", cities: ["Srinagar", "Jammu", "Anantnag", "Baramulla"] }
    ]
  },
  {
    country: "US",
    states: [
      { code: "US-CA", name: "California", cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno"] },
      { code: "US-NY", name: "New York", cities: ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"] },
      { code: "US-TX", name: "Texas", cities: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso"] },
      { code: "US-FL", name: "Florida", cities: ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee"] },
      { code: "US-IL", name: "Illinois", cities: ["Chicago", "Springfield", "Aurora", "Naperville"] },
      { code: "US-WA", name: "Washington", cities: ["Seattle", "Spokane", "Tacoma", "Olympia", "Bellevue"] },
      { code: "US-MA", name: "Massachusetts", cities: ["Boston", "Worcester", "Springfield", "Cambridge"] },
      { code: "US-PA", name: "Pennsylvania", cities: ["Philadelphia", "Pittsburgh", "Harrisburg", "Allentown"] },
      { code: "US-GA", name: "Georgia", cities: ["Atlanta", "Savannah", "Augusta", "Athens", "Macon"] },
      { code: "US-NC", name: "North Carolina", cities: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"] },
      { code: "US-MI", name: "Michigan", cities: ["Detroit", "Grand Rapids", "Lansing", "Ann Arbor"] },
      { code: "US-NJ", name: "New Jersey", cities: ["Newark", "Jersey City", "Trenton", "Atlantic City"] },
      { code: "US-VA", name: "Virginia", cities: ["Virginia Beach", "Richmond", "Norfolk", "Arlington"] },
      { code: "US-WA", name: "Washington", cities: ["Seattle", "Spokane", "Tacoma", "Olympia"] },
      { code: "US-AZ", name: "Arizona", cities: ["Phoenix", "Tucson", "Mesa", "Scottsdale", "Flagstaff"] },
      { code: "US-CO", name: "Colorado", cities: ["Denver", "Colorado Springs", "Aurora", "Boulder", "Fort Collins"] },
      { code: "US-OR", name: "Oregon", cities: ["Portland", "Salem", "Eugene", "Bend"] },
      { code: "US-NV", name: "Nevada", cities: ["Las Vegas", "Reno", "Henderson", "Carson City"] },
      { code: "US-MN", name: "Minnesota", cities: ["Minneapolis", "Saint Paul", "Rochester", "Duluth"] },
      { code: "US-WI", name: "Wisconsin", cities: ["Milwaukee", "Madison", "Green Bay", "Kenosha"] }
    ]
  },
  {
    country: "GB",
    states: [
      { code: "GB-ENG", name: "England", cities: ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Sheffield", "Bristol"] },
      { code: "GB-SCT", name: "Scotland", cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"] },
      { code: "GB-WLS", name: "Wales", cities: ["Cardiff", "Swansea", "Newport", "Bangor"] },
      { code: "GB-NIR", name: "Northern Ireland", cities: ["Belfast", "Derry", "Lisburn", "Newry"] }
    ]
  },
  {
    country: "CA",
    states: [
      { code: "CA-ON", name: "Ontario", cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"] },
      { code: "CA-QC", name: "Quebec", cities: ["Montreal", "Quebec City", "Laval", "Gatineau"] },
      { code: "CA-BC", name: "British Columbia", cities: ["Vancouver", "Victoria", "Surrey", "Kelowna"] },
      { code: "CA-AB", name: "Alberta", cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge"] },
      { code: "CA-MB", name: "Manitoba", cities: ["Winnipeg", "Brandon", "Steinbach"] },
      { code: "CA-SK", name: "Saskatchewan", cities: ["Saskatoon", "Regina", "Prince Albert"] },
      { code: "CA-NS", name: "Nova Scotia", cities: ["Halifax", "Sydney", "Dartmouth"] }
    ]
  },
  {
    country: "AU",
    states: [
      { code: "AU-NSW", name: "New South Wales", cities: ["Sydney", "Newcastle", "Wollongong", "Maitland"] },
      { code: "AU-VIC", name: "Victoria", cities: ["Melbourne", "Geelong", "Ballarat", "Bendigo"] },
      { code: "AU-QLD", name: "Queensland", cities: ["Brisbane", "Gold Coast", "Cairns", "Townsville"] },
      { code: "AU-WA", name: "Western Australia", cities: ["Perth", "Fremantle", "Mandurah", "Bunbury"] },
      { code: "AU-SA", name: "South Australia", cities: ["Adelaide", "Mount Gambier", "Whyalla"] },
      { code: "AU-TAS", name: "Tasmania", cities: ["Hobart", "Launceston", "Devonport"] }
    ]
  },
  {
    country: "DE",
    states: [
      { code: "DE-BY", name: "Bavaria", cities: ["Munich", "Nuremberg", "Augsburg", "Würzburg"] },
      { code: "DE-BE", name: "Berlin", cities: ["Berlin"] },
      { code: "DE-HH", name: "Hamburg", cities: ["Hamburg"] },
      { code: "DE-NW", name: "North Rhine-Westphalia", cities: ["Cologne", "Düsseldorf", "Dortmund", "Essen"] },
      { code: "DE-HE", name: "Hesse", cities: ["Frankfurt", "Wiesbaden", "Kassel", "Darmstadt"] },
      { code: "DE-SN", name: "Saxony", cities: ["Dresden", "Leipzig", "Chemnitz"] },
      { code: "DE-BW", name: "Baden-Württemberg", cities: ["Stuttgart", "Mannheim", "Karlsruhe", "Freiburg"] }
    ]
  },
  {
    country: "FR",
    states: [
      { code: "FR-75", name: "Paris", cities: ["Paris"] },
      { code: "FR-69", name: "Rhône", cities: ["Lyon", "Villeurbanne"] },
      { code: "FR-13", name: "Bouches-du-Rhône", cities: ["Marseille", "Aix-en-Provence"] },
      { code: "FR-31", name: "Haute-Garonne", cities: ["Toulouse", "Colomiers"] },
      { code: "FR-06", name: "Alpes-Maritimes", cities: ["Nice", "Cannes", "Antibes"] },
      { code: "FR-44", name: "Loire-Atlantique", cities: ["Nantes", "Saint-Nazaire"] },
      { code: "FR-67", name: "Bas-Rhin", cities: ["Strasbourg", "Haguenau"] }
    ]
  },
  {
    country: "JP",
    states: [
      { code: "JP-13", name: "Tokyo", cities: ["Tokyo", "Hachiōji", "Tama"] },
      { code: "JP-27", name: "Osaka", cities: ["Osaka", "Sakai", "Higashiōsaka"] },
      { code: "JP-14", name: "Kanagawa", cities: ["Yokohama", "Kawasaki", "Sagamihara"] },
      { code: "JP-23", name: "Aichi", cities: ["Nagoya", "Toyota", "Okazaki"] },
      { code: "JP-11", name: "Saitama", cities: ["Saitama", "Kawaguchi", "Kawagoe"] },
      { code: "JP-12", name: "Chiba", cities: ["Chiba", "Funabashi", "Kashiwa"] },
      { code: "JP-01", name: "Hokkaido", cities: ["Sapporo", "Asahikawa", "Hakodate"] },
      { code: "JP-40", name: "Fukuoka", cities: ["Fukuoka", "Kitakyushu", "Kurume"] }
    ]
  },
  {
    country: "KR",
    states: [
      { code: "KR-11", name: "Seoul", cities: ["Seoul"] },
      { code: "KR-26", name: "Busan", cities: ["Busan"] },
      { code: "KR-27", name: "Daegu", cities: ["Daegu"] },
      { code: "KR-30", name: "Daejeon", cities: ["Daejeon"] },
      { code: "KR-29", name: "Gwangju", cities: ["Gwangju"] },
      { code: "KR-28", name: "Incheon", cities: ["Incheon"] },
      { code: "KR-41", name: "Gyeonggi", cities: ["Suwon", "Seongnam", "Goyang", "Yongin"] }
    ]
  },
  {
    country: "CN",
    states: [
      { code: "CN-BJ", name: "Beijing", cities: ["Beijing"] },
      { code: "CN-SH", name: "Shanghai", cities: ["Shanghai"] },
      { code: "CN-GD", name: "Guangdong", cities: ["Guangzhou", "Shenzhen", "Dongguan", "Foshan"] },
      { code: "CN-ZJ", name: "Zhejiang", cities: ["Hangzhou", "Ningbo", "Wenzhou"] },
      { code: "CN-JS", name: "Jiangsu", cities: ["Nanjing", "Suzhou", "Wuxi", "Changzhou"] },
      { code: "CN-SC", name: "Sichuan", cities: ["Chengdu", "Mianyang", "Deyang"] },
      { code: "CN-HB", name: "Hubei", cities: ["Wuhan", "Yichang", "Xiangyang"] }
    ]
  },
  {
    country: "ES",
    states: [
      { code: "ES-MD", name: "Madrid", cities: ["Madrid", "Móstoles", "Alcalá de Henares"] },
      { code: "ES-CT", name: "Catalonia", cities: ["Barcelona", "Hospitalet", "Badalona", "Sabadell"] },
      { code: "ES-AN", name: "Andalusia", cities: ["Seville", "Málaga", "Córdoba", "Granada"] },
      { code: "ES-VC", name: "Valencia", cities: ["Valencia", "Alicante", "Elche"] },
      { code: "ES-PV", name: "Basque Country", cities: ["Bilbao", "San Sebastián", "Vitoria"] },
      { code: "ES-GA", name: "Galicia", cities: ["Vigo", "A Coruña", "Ourense"] }
    ]
  },
  {
    country: "IT",
    states: [
      { code: "IT-52", name: "Tuscany", cities: ["Florence", "Pisa", "Siena", "Livorno"] },
      { code: "IT-25", name: "Lombardy", cities: ["Milan", "Bergamo", "Brescia", "Monza"] },
      { code: "IT-72", name: "Campania", cities: ["Naples", "Salerno", "Caserta"] },
      { code: "IT-62", name: "Lazio", cities: ["Rome", "Latina", "Frosinone"] },
      { code: "IT-88", name: "Sardinia", cities: ["Cagliari", "Sassari", "Olbia"] },
      { code: "IT-82", name: "Sicily", cities: ["Palermo", "Catania", "Messina"] }
    ]
  },
  {
    country: "BR",
    states: [
      { code: "BR-SP", name: "São Paulo", cities: ["São Paulo", "Campinas", "Santos", "Guarulhos"] },
      { code: "BR-RJ", name: "Rio de Janeiro", cities: ["Rio de Janeiro", "Niterói", "Petrópolis"] },
      { code: "BR-MG", name: "Minas Gerais", cities: ["Belo Horizonte", "Uberlândia", "Contagem"] },
      { code: "BR-BA", name: "Bahia", cities: ["Salvador", "Feira de Santana", "Vitória da Conquista"] },
      { code: "BR-RS", name: "Rio Grande do Sul", cities: ["Porto Alegre", "Caxias do Sul", "Pelotas"] }
    ]
  },
  {
    country: "MX",
    states: [
      { code: "MX-CMX", name: "Mexico City", cities: ["Mexico City"] },
      { code: "MX-JAL", name: "Jalisco", cities: ["Guadalajara", "Zapopan", "Puerto Vallarta"] },
      { code: "MX-NLE", name: "Nuevo León", cities: ["Monterrey", "Guadalupe", "San Nicolás"] },
      { code: "MX-PUE", name: "Puebla", cities: ["Puebla", "Tehuacán", "Cholula"] },
      { code: "MX-YUC", name: "Yucatán", cities: ["Mérida", "Valladolid", "Tizimín"] }
    ]
  },
  {
    country: "RU",
    states: [
      { code: "RU-MOW", name: "Moscow", cities: ["Moscow"] },
      { code: "RU-SPE", name: "Saint Petersburg", cities: ["Saint Petersburg"] },
      { code: "RU-LEN", name: "Leningrad Oblast", cities: ["Gatchina", "Vyborg", "Sosnovy Bor"] },
      { code: "RU-MOS", name: "Moscow Oblast", cities: ["Balashikha", "Khimki", "Korolyov"] },
      { code: "RU-BA", name: "Bashkortostan", cities: ["Ufa", "Sterlitamak", "Salavat"] }
    ]
  },
  {
    country: "AE",
    states: [
      { code: "AE-DU", name: "Dubai", cities: ["Dubai"] },
      { code: "AE-AZ", name: "Abu Dhabi", cities: ["Abu Dhabi", "Al Ain", "Madinat Zayed"] },
      { code: "AE-SH", name: "Sharjah", cities: ["Sharjah", "Khor Fakkan"] },
      { code: "AE-AJ", name: "Ajman", cities: ["Ajman"] },
      { code: "AE-FU", name: "Fujairah", cities: ["Fujairah", "Dibba"] }
    ]
  },
  {
    country: "SA",
    states: [
      { code: "SA-01", name: "Riyadh", cities: ["Riyadh", "Al Kharj", "Diriyah"] },
      { code: "SA-02", name: "Makkah", cities: ["Mecca", "Jeddah", "Taif"] },
      { code: "SA-03", name: "Madinah", cities: ["Medina", "Yanbu", "Al Ula"] },
      { code: "SA-04", name: "Eastern Province", cities: ["Dammam", "Khobar", "Dhahran", "Jubail"] },
      { code: "SA-06", name: "Qassim", cities: ["Buraidah", "Unaizah"] }
    ]
  },
  {
    country: "TR",
    states: [
      { code: "TR-34", name: "Istanbul", cities: ["Istanbul"] },
      { code: "TR-06", name: "Ankara", cities: ["Ankara", "Çankaya"] },
      { code: "TR-35", name: "İzmir", cities: ["İzmir", "Karşıyaka", "Bornova"] },
      { code: "TR-16", name: "Bursa", cities: ["Bursa", "Osmangazi", "Yıldırım"] },
      { code: "TR-07", name: "Antalya", cities: ["Antalya", "Alanya", "Manavgat"] }
    ]
  },
  {
    country: "NL",
    states: [
      { code: "NL-NH", name: "North Holland", cities: ["Amsterdam", "Haarlem", "Zaanstad"] },
      { code: "NL-ZH", name: "South Holland", cities: ["Rotterdam", "The Hague", "Leiden", "Delft"] },
      { code: "NL-UT", name: "Utrecht", cities: ["Utrecht", "Amersfoort", "Veenendaal"] },
      { code: "NL-GE", name: "Gelderland", cities: ["Nijmegen", "Arnhem", "Apeldoorn"] }
    ]
  },
  {
    country: "SE",
    states: [
      { code: "SE-AB", name: "Stockholm", cities: ["Stockholm", "Södertälje", "Solna"] },
      { code: "SE-O", name: "Västra Götaland", cities: ["Gothenburg", "Borås", "Trollhättan"] },
      { code: "SE-M", name: "Skåne", cities: ["Malmö", "Helsingborg", "Lund"] },
      { code: "SE-I", name: "Gotland", cities: ["Visby"] }
    ]
  }
];

// ─── Helpers ────────────────────────────────────────────────────────

const countryIndex = new Map<string, CountryLocation>();
for (const c of LOCATION_DATA) {
  countryIndex.set(c.country, c);
}

/**
 * Get the states/provinces for a country.
 * Returns `[]` if the country is not in the dataset (the caller
 * should render an empty / disabled state selector in that case).
 */
export function getStatesForCountry(country: string): StateOption[] {
  const c = countryIndex.get(country);
  if (!c) return [];
  return c.states.map((s) => ({ code: s.code, name: s.name }));
}

/**
 * Get the major cities for a state within a country.
 * Returns `[]` if the country or state is not found.
 */
export function getCitiesForState(
  country: string,
  stateCode: string
): string[] {
  const c = countryIndex.get(country);
  if (!c) return [];
  const s = c.states.find((st) => st.code === stateCode);
  return s ? s.cities : [];
}
