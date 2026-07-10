// src/shared/data/curatedCollections.ts
import type { Collection, ViewingOrderOption } from "~/shared/types";

/**
 * Curated CineLog Collections — handcrafted cinematic universes.
 *
 * These are NOT TMDB collections. They can mix movies + TV, support
 * multiple viewing orders, and are manually maintained.
 *
 * Each universe has:
 *   - id: slug for routing
 *   - name: display name
 *   - description: editorial copy
 *   - backdrop_path: TMDB image path for the hero
 *   - viewingOrders: available viewing modes (chronological, release, saga, story)
 *   - entries: ordered array with TMDB id, media_type, cached metadata,
 *     entryType (Movie/Series/Special), phase (for saga grouping), and
 *     storyYear (for story timeline mode)
 *   - franchiseId: parent franchise slug
 *   - accentColor: brand color for the universe
 */

const STANDARD_ORDERS: ViewingOrderOption[] = [
  { id: "chronological", label: "Chronological", description: "Story timeline order" },
  { id: "release", label: "Release Order", description: "Theatrical release date order" }
];

const MCU_ORDERS: ViewingOrderOption[] = [
  { id: "chronological", label: "Chronological", description: "Story timeline order" },
  { id: "release", label: "Release Order", description: "Theatrical release date order" },
  { id: "saga", label: "By Phase", description: "Grouped by MCU phases" },
  { id: "story", label: "Story Timeline", description: "By in-universe year" }
];

export const CURATED_COLLECTIONS: Collection[] = [
  {
    id: "mcu-chronological",
    name: "Marvel Cinematic Universe",
    type: "curated",
    description: "The complete MCU in story chronological order — every film, series, and special in the timeline they occur.",
    backdrop_path: "/9BBtojrJ1JyKr3t4mCMzYsBa9eT.jpg",
    tags: ["Marvel", "Superhero", "Chronological"],
    franchiseId: "marvel",
    accentColor: "#E62429",
    viewingOrders: MCU_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "1771", media_type: "movie", title: "Captain America: The First Avenger", release_date: "2011-07-22", poster_path: "/vSNxAJTlD0r02V9sPYpOjqDZXUK.jpg", entryType: "Movie", phase: "Phase 1", storyYear: 1943, order: 0 },
      { id: "38457", media_type: "tv", title: "Marvel's Agent Carter", first_air_date: "2015-01-06", poster_path: "/wHZqWaCxBm5LOQunPiPlRzwRsD6.jpg", entryType: "Series", phase: "Phase 1", storyYear: 1946, order: 1 },
      { id: "1726", media_type: "movie", title: "Iron Man", release_date: "2008-04-30", poster_path: "/78lPtwv72eTNqFW9COBYI0dWDJa.jpg", entryType: "Movie", phase: "Phase 1", storyYear: 2010, order: 2 },
      { id: "1724", media_type: "movie", title: "Iron Man 2", release_date: "2010-04-28", poster_path: "/6WBeq4fCfn7ANnsoBcLV9PlhvCp.jpg", entryType: "Movie", phase: "Phase 1", storyYear: 2011, order: 3 },
      { id: "10138", media_type: "movie", title: "Thor", release_date: "2011-04-21", poster_path: "/bJZDm6nQc3Y9klJmD4nLp5z6eQj.jpg", entryType: "Movie", phase: "Phase 1", storyYear: 2011, order: 4 },
      { id: "24428", media_type: "movie", title: "The Avengers", release_date: "2012-04-25", poster_path: "/RYMX2wcKCBAr24UyPD7xwmjdTpd.jpg", entryType: "Movie", phase: "Phase 1", storyYear: 2012, order: 5 },
      { id: "1403", media_type: "tv", title: "Marvel's Agents of S.H.I.E.L.D.", first_air_date: "2013-09-24", poster_path: "/5dEB9OJqKYj2SEfUeMYL7R9nWwK.jpg", entryType: "Series", phase: "Phase 2", storyYear: 2013, order: 6 },
      { id: "68721", media_type: "movie", title: "Iron Man 3", release_date: "2013-04-18", poster_path: "/7XiGqZEoMEYJQU3BvW0f6c0wcZd.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2012, order: 7 },
      { id: "76338", media_type: "movie", title: "Thor: The Dark World", release_date: "2013-10-29", poster_path: "/bn4qMHRzC1eKzqnuHk3PjVfIuK6.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2013, order: 8 },
      { id: "100402", media_type: "movie", title: "Captain America: The Winter Soldier", release_date: "2014-03-20", poster_path: "/5TQ6YDmymBpnF005OwpB7T4pWKz.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2014, order: 9 },
      { id: "118340", media_type: "movie", title: "Guardians of the Galaxy", release_date: "2014-07-30", poster_path: "/r7vmZjiyZw9rpJMQJdXljgi5eB0.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2014, order: 10 },
      { id: "99861", media_type: "movie", title: "Avengers: Age of Ultron", release_date: "2015-04-22", poster_path: "/4SSW6qMlJyNh5eONQFBlp1RBqJK.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2015, order: 11 },
      { id: "102899", media_type: "movie", title: "Ant-Man", release_date: "2015-07-14", poster_path: "/D6e8RJf2qUstnf5t0ot0XrtoXc.jpg", entryType: "Movie", phase: "Phase 2", storyYear: 2015, order: 12 },
      { id: "277834", media_type: "movie", title: "Captain America: Civil War", release_date: "2016-04-27", poster_path: "/rAGeXeF3Ay9EZ2Q4g4K3cSPYp0h.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2016, order: 13 },
      { id: "315635", media_type: "movie", title: "Spider-Man: Homecoming", release_date: "2017-07-05", poster_path: "/c24sv2weTHPsmDa7jEMN0m2W3O5.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2016, order: 14 },
      { id: "284054", media_type: "movie", title: "Doctor Strange", release_date: "2016-10-20", poster_path: "/4PiiNGXj1KENTmRBMcNkvW2xRsY.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2016, order: 15 },
      { id: "283995", media_type: "movie", title: "Guardians of the Galaxy Vol. 2", release_date: "2017-04-19", poster_path: "/d4hcAuP4nRhnZvwkkk3K9arQwls.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2014, order: 16 },
      { id: "293660", media_type: "movie", title: "Thor: Ragnarok", release_date: "2017-10-24", poster_path: "/rzRwTcFvttcN1ZpX2xv4j3tUySf.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2017, order: 17 },
      { id: "299536", media_type: "movie", title: "Avengers: Infinity War", release_date: "2018-04-23", poster_path: "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2018, order: 18 },
      { id: "363088", media_type: "movie", title: "Ant-Man and the Wasp", release_date: "2018-07-04", poster_path: "/eivb8xWHGGM5gnxdEYJfM5DFLZB.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2018, order: 19 },
      { id: "299534", media_type: "movie", title: "Avengers: Endgame", release_date: "2019-04-22", poster_path: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2023, order: 20 },
      { id: "429617", media_type: "movie", title: "Spider-Man: Far From Home", release_date: "2019-06-28", poster_path: "/4q2NNj4S5dGsuRLFVP127uJd8hn.jpg", entryType: "Movie", phase: "Phase 3", storyYear: 2024, order: 21 },
      { id: "85271", media_type: "tv", title: "WandaVision", first_air_date: "2021-01-15", poster_path: "/glKDfE6btIRcVB5zrjspRIs4r52.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2023, order: 22 },
      { id: "88396", media_type: "tv", title: "The Falcon and the Winter Soldier", first_air_date: "2021-03-19", poster_path: "/6kbAMLteGO8miewkeuPD6UXkE7P.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2024, order: 23 },
      { id: "84958", media_type: "tv", title: "Loki", first_air_date: "2021-06-09", poster_path: "/voHUmluaY4qhaVDwH0QWP8St5lq.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2012, order: 24 },
      { id: "89708", media_type: "tv", title: "What If...?", first_air_date: "2021-08-11", poster_path: "/lUzAoLSxI2JmXZc4nckIBLRgoeC.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2023, order: 25 },
      { id: "566525", media_type: "movie", title: "Shang-Chi and the Legend of the Ten Rings", release_date: "2021-09-01", poster_path: "/1ni8ChMaU9Q2hAR3YfVyr7g8Y3z.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2024, order: 26 },
      { id: "524434", media_type: "movie", title: "Eternals", release_date: "2021-10-18", poster_path: "/b6qUu00iIXk3FAsKi6fr5xL1NBI.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2024, order: 27 },
      { id: "634649", media_type: "movie", title: "Spider-Man: No Way Home", release_date: "2021-12-15", poster_path: "/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2024, order: 28 },
      { id: "88329", media_type: "tv", title: "Hawkeye", first_air_date: "2021-11-24", poster_path: "/r4COvsgFUmlRL7NJeOofTKV3G1H.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2024, order: 29 },
      { id: "92749", media_type: "tv", title: "Moon Knight", first_air_date: "2022-03-30", poster_path: "/Yprs1eyzGGhfc0XiXz1xUePMBqN.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2025, order: 30 },
      { id: "453395", media_type: "movie", title: "Doctor Strange in the Multiverse of Madness", release_date: "2022-05-04", poster_path: "/9Rd2CN5XmKjRumxhmFXk9pEVyJQ.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2024, order: 31 },
      { id: "92782", media_type: "tv", title: "Ms. Marvel", first_air_date: "2022-06-08", poster_path: "/8gIlBkKZZRz3i7y3tCj7EeQwtui.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2025, order: 32 },
      { id: "616037", media_type: "movie", title: "Thor: Love and Thunder", release_date: "2022-07-06", poster_path: "/pIkRyD18kl4FhoCNQbuzsr9UEDV.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2025, order: 33 },
      { id: "92783", media_type: "tv", title: "She-Hulk: Attorney at Law", first_air_date: "2022-08-17", poster_path: "/nqrVjBmg4JOpJkAEp4MAwQ1V8os.jpg", entryType: "Series", phase: "Phase 4", storyYear: 2025, order: 34 },
      { id: "505642", media_type: "movie", title: "Black Panther: Wakanda Forever", release_date: "2022-11-09", poster_path: "/sv1xJUazXeYqALzczSZQ2hkH2QF.jpg", entryType: "Movie", phase: "Phase 4", storyYear: 2025, order: 35 }
    ]
  },
  {
    id: "star-wars-timeline",
    name: "Star Wars Universe",
    type: "curated",
    description: "The complete Star Wars saga in chronological story order, from The Phantom Menace to The Rise of Skywalker.",
    backdrop_path: "/d8duYyyC9J5T825Hg7grmaabfxQ.jpg",
    tags: ["Star Wars", "Sci-Fi", "Chronological"],
    franchiseId: "star-wars",
    accentColor: "#FFE81F",
    viewingOrders: [
      ...STANDARD_ORDERS,
      { id: "saga", label: "By Trilogy", description: "Grouped by Original, Prequel, and Sequel trilogies" },
      { id: "story", label: "Story Timeline", description: "By in-universe year (BBY/ABY)" }
    ],
    defaultOrder: "chronological",
    entries: [
      { id: "1893", media_type: "movie", title: "Star Wars: Episode I - The Phantom Menace", release_date: "1999-05-19", poster_path: "/n8D09WDVP1TrQxR5hcWVicdX5Nw.jpg", entryType: "Movie", phase: "Prequel Trilogy", storyYear: -32, order: 0 },
      { id: "1894", media_type: "movie", title: "Star Wars: Episode II - Attack of the Clones", release_date: "2002-05-15", poster_path: "/k3IM8aA7iEU8RBXLDFFGT9R1nUy.jpg", entryType: "Movie", phase: "Prequel Trilogy", storyYear: -22, order: 1 },
      { id: "1895", media_type: "movie", title: "Star Wars: Episode III - Revenge of the Sith", release_date: "2005-05-17", poster_path: "/tUS8M6HoAb7qL0wk2hj8lUi6TJe.jpg", entryType: "Movie", phase: "Prequel Trilogy", storyYear: -19, order: 2 },
      { id: "11", media_type: "movie", title: "Star Wars: Episode IV - A New Hope", release_date: "1977-05-25", poster_path: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg", entryType: "Movie", phase: "Original Trilogy", storyYear: 0, order: 3 },
      { id: "1891", media_type: "movie", title: "Star Wars: Episode V - The Empire Strikes Back", release_date: "1980-05-17", poster_path: "/7BuH8itoSrLExs2YZSsM01Qk2no.jpg", entryType: "Movie", phase: "Original Trilogy", storyYear: 3, order: 4 },
      { id: "1892", media_type: "movie", title: "Star Wars: Episode VI - Return of the Jedi", release_date: "1983-05-25", poster_path: "/jxWpM1jZC9npT2nFUCUM5b5B9vx.jpg", entryType: "Movie", phase: "Original Trilogy", storyYear: 4, order: 5 },
      { id: "140607", media_type: "movie", title: "Star Wars: The Force Awakens", release_date: "2015-12-15", poster_path: "/wqnqdwzBCu6egxoyWqGqkLtYjyk.jpg", entryType: "Movie", phase: "Sequel Trilogy", storyYear: 34, order: 6 },
      { id: "181808", media_type: "movie", title: "Star Wars: The Last Jedi", release_date: "2017-12-09", poster_path: "/kOVEVeg59EUnweXtt2iNBdd2rPo.jpg", entryType: "Movie", phase: "Sequel Trilogy", storyYear: 34, order: 7 },
      { id: "181812", media_type: "movie", title: "Star Wars: The Rise of Skywalker", release_date: "2019-12-18", poster_path: "/AdYJmnSnmBJBrrL4HhaWBc6ysO6.jpg", entryType: "Movie", phase: "Sequel Trilogy", storyYear: 35, order: 8 }
    ]
  },
  {
    id: "middle-earth",
    name: "Middle Earth",
    type: "curated",
    description: "The complete Middle Earth saga — The Hobbit and The Lord of the Rings trilogies in story chronological order.",
    backdrop_path: "/9deGfFCcrun4q3OFCb4zOhmRJ6P.jpg",
    tags: ["Fantasy", "LOTR", "Hobbit"],
    franchiseId: "middle-earth",
    accentColor: "#8B6914",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "121", media_type: "movie", title: "The Hobbit: An Unexpected Journey", release_date: "2012-11-28", poster_path: "/y7ep7lhPcUl7w5XpIuKLfvQRQ4v.jpg", entryType: "Movie", phase: "The Hobbit", order: 0 },
      { id: "122", media_type: "movie", title: "The Hobbit: The Desolation of Smaug", release_date: "2013-12-02", poster_path: "/9U9Y5GQuWX3EZy39B8nkk4NY01S.jpg", entryType: "Movie", phase: "The Hobbit", order: 1 },
      { id: "123", media_type: "movie", title: "The Hobbit: The Battle of the Five Armies", release_date: "2014-12-01", poster_path: "/cxU3vN6j6yiMB8O2iVh0U5c4u5d.jpg", entryType: "Movie", phase: "The Hobbit", order: 2 },
      { id: "120", media_type: "movie", title: "The Lord of the Rings: The Fellowship of the Ring", release_date: "2001-12-18", poster_path: "/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg", entryType: "Movie", phase: "The Lord of the Rings", order: 3 },
      { id: "121", media_type: "movie", title: "The Lord of the Rings: The Two Towers", release_date: "2002-12-18", poster_path: "/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg", entryType: "Movie", phase: "The Lord of the Rings", order: 4 },
      { id: "122", media_type: "movie", title: "The Lord of the Rings: The Return of the King", release_date: "2003-12-01", poster_path: "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg", entryType: "Movie", phase: "The Lord of the Rings", order: 5 }
    ]
  },
  {
    id: "dark-knight-trilogy",
    name: "The Dark Knight Trilogy",
    type: "curated",
    description: "Christopher Nolan's complete Batman saga — from Batman Begins to The Dark Knight Rises.",
    backdrop_path: "/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg",
    tags: ["Batman", "Nolan", "DC"],
    franchiseId: "dc",
    accentColor: "#2C2C2C",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "272", media_type: "movie", title: "Batman Begins", release_date: "2005-06-10", poster_path: "/4MpN4kIEqUjW8OPtOQJXlTdHiJV.jpg", entryType: "Movie", order: 0 },
      { id: "155", media_type: "movie", title: "The Dark Knight", release_date: "2008-07-16", poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", entryType: "Movie", order: 1 },
      { id: "49026", media_type: "movie", title: "The Dark Knight Rises", release_date: "2012-07-16", poster_path: "/hr0L2aueqlP2BYUblTTjmtn0hw4.jpg", entryType: "Movie", order: 2 }
    ]
  },
  {
    id: "john-wick",
    name: "John Wick Saga",
    type: "curated",
    description: "The complete John Wick saga — from the original to Chapter 4.",
    backdrop_path: "/h3KN24PrOheHVYs9ypuOIdFBEpX.jpg",
    tags: ["Action", "Keanu"],
    franchiseId: "spy-thriller",
    accentColor: "#C41E3A",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "245891", media_type: "movie", title: "John Wick", release_date: "2014-10-24", poster_path: "/fZPSd91yGE9fCcBy6GlmKtPpc7E.jpg", entryType: "Movie", order: 0 },
      { id: "324552", media_type: "movie", title: "John Wick: Chapter 2", release_date: "2017-02-08", poster_path: "/hXWBc0ioZfRdr2f5y8aX5z9tHjk.jpg", entryType: "Movie", order: 1 },
      { id: "524047", media_type: "movie", title: "John Wick: Chapter 3 - Parabellum", release_date: "2019-05-15", poster_path: "/vV36nfql6PcmRfH4m1A27s9VKS.jpg", entryType: "Movie", order: 2 },
      { id: "603692", media_type: "movie", title: "John Wick: Chapter 4", release_date: "2023-03-22", poster_path: "/7I6VUdPj6tQECNHdviJkUHD2u89.jpg", entryType: "Movie", order: 3 }
    ]
  },
  {
    id: "harry-potter",
    name: "Wizarding World",
    type: "curated",
    description: "The complete Harry Potter film series in story order, from Philosopher's Stone to Deathly Hallows.",
    backdrop_path: "/8NG2cq1Z7x2wbe2fNJxfgMgx9I7.jpg",
    tags: ["Harry Potter", "Fantasy", "Magic"],
    franchiseId: "wizarding-world",
    accentColor: "#7B5EA7",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "671", media_type: "movie", title: "Harry Potter and the Philosopher's Stone", release_date: "2001-11-16", poster_path: "/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg", entryType: "Movie", order: 0 },
      { id: "672", media_type: "movie", title: "Harry Potter and the Chamber of Secrets", release_date: "2002-11-13", poster_path: "/d3IPSDFhEr4UbtPe51odzgK5J6N.jpg", entryType: "Movie", order: 1 },
      { id: "673", media_type: "movie", title: "Harry Potter and the Prisoner of Azkaban", release_date: "2004-05-31", poster_path: "/aWxZJrM6VWlq1e8VgDy5U3TII2A.jpg", entryType: "Movie", order: 2 },
      { id: "674", media_type: "movie", title: "Harry Potter and the Goblet of Fire", release_date: "2005-11-16", poster_path: "/bFrIe5NR7n5xtuIeMQZe2c3wJ9B.jpg", entryType: "Movie", order: 3 },
      { id: "675", media_type: "movie", title: "Harry Potter and the Order of the Phoenix", release_date: "2007-07-08", poster_path: "/4jXeF07mRunjjfwgz0c4ZvPyAwa.jpg", entryType: "Movie", order: 4 },
      { id: "676", media_type: "movie", title: "Harry Potter and the Half-Blood Prince", release_date: "2009-07-07", poster_path: "/4mYrXoo7OfQK06GdGiV2OAVLqJk.jpg", entryType: "Movie", order: 5 },
      { id: "12444", media_type: "movie", title: "Harry Potter and the Deathly Hallows: Part 1", release_date: "2010-10-17", poster_path: "/lGAaaIz4MoSEcJUqCYwGwo7pB2D.jpg", entryType: "Movie", order: 6 },
      { id: "12445", media_type: "movie", title: "Harry Potter and the Deathly Hallows: Part 2", release_date: "2011-07-15", poster_path: "/9Bga6STYMnza71Zz0zCFZq1i4FV.jpg", entryType: "Movie", order: 7 }
    ]
  },
  /* ====== NEW CURATED UNIVERSES ====== */
  {
    id: "dceu",
    name: "DC Extended Universe",
    type: "curated",
    description: "The DCEU from Man of Steel through Aquaman and the Lost Kingdom — Zack Snyder's vision and beyond.",
    backdrop_path: "/5SUpUS6MRMwApH6UqxxFfS3xGYq.jpg",
    tags: ["DC", "Superhero", "DCEU"],
    franchiseId: "dc",
    accentColor: "#0078D7",
    viewingOrders: [
      ...STANDARD_ORDERS,
      { id: "saga", label: "By Phase", description: "Grouped by DCEU phases" }
    ],
    defaultOrder: "chronological",
    entries: [
      { id: "49521", media_type: "movie", title: "Man of Steel", release_date: "2013-06-12", poster_path: "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", entryType: "Movie", phase: "Phase 1", order: 0 },
      { id: "209112", media_type: "movie", title: "Batman v Superman: Dawn of Justice", release_date: "2016-03-23", poster_path: "/cGOPbv9wA5gE5kH6PmOhiOEzX6Q.jpg", entryType: "Movie", phase: "Phase 1", order: 1 },
      { id: "297762", media_type: "movie", title: "Suicide Squad", release_date: "2016-08-03", poster_path: "/e1mjopzAS2KNsvpbpahQ1a6SkSn.jpg", entryType: "Movie", phase: "Phase 1", order: 2 },
      { id: "141052", media_type: "movie", title: "Justice League", release_date: "2017-11-15", poster_path: "/eifKmGJ6jkBGKc7ZxY0G1RAv0Sm.jpg", entryType: "Movie", phase: "Phase 1", order: 3 },
      { id: "297761", media_type: "movie", title: "Aquaman", release_date: "2018-12-07", poster_path: "/ydKpl5oqsmX0KYsHOBCh6gIz7SY.jpg", entryType: "Movie", phase: "Phase 2", order: 4 },
      { id: "429617", media_type: "movie", title: "Shazam!", release_date: "2019-04-05", poster_path: "/xnzuwBB7gDF3Gx7AKx3vTCeMQBv.jpg", entryType: "Movie", phase: "Phase 2", order: 5 },
      { id: "524434", media_type: "movie", title: "Birds of Prey", release_date: "2020-02-05", poster_path: "/h4VB6m0RwcicVEZvzftYZyKXs6K.jpg", entryType: "Movie", phase: "Phase 2", order: 6 },
      { id: "792307", media_type: "movie", title: "Black Adam", release_date: "2022-10-19", poster_path: "/3zXjNTAoXrNR5VaJbqXVZITVgM8.jpg", entryType: "Movie", phase: "Phase 3", order: 7 },
      { id: "593643", media_type: "movie", title: "The Flash", release_date: "2023-06-13", poster_path: "/r8D5DSr1Mpxmi5YKGBDlIDln6Yg.jpg", entryType: "Movie", phase: "Phase 3", order: 8 },
      { id: "705999", media_type: "movie", title: "Blue Beetle", release_date: "2023-08-16", poster_path: "/mXLOa3F8aS9LO0AXM2qVVp5MJjS.jpg", entryType: "Movie", phase: "Phase 3", order: 9 },
      { id: "545609", media_type: "movie", title: "Aquaman and the Lost Kingdom", release_date: "2023-12-20", poster_path: "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", entryType: "Movie", phase: "Phase 3", order: 10 }
    ]
  },
  {
    id: "dcu",
    name: "DC Universe (Gunn)",
    type: "curated",
    description: "James Gunn's new DC Universe — a fresh start with Superman and beyond.",
    backdrop_path: "/5SUpUS6MRMwApH6UqxxFfS3xGYq.jpg",
    tags: ["DC", "DCU", "James Gunn"],
    franchiseId: "dc",
    accentColor: "#1E90FF",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "823625", media_type: "movie", title: "Superman", release_date: "2025-07-11", poster_path: "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", entryType: "Movie", order: 0 }
    ]
  },
  {
    id: "batman-universe",
    name: "Batman Universe",
    type: "curated",
    description: "Every cinematic Batman — from Tim Burton's gothic vision to Matt Reeves' dark detective story.",
    backdrop_path: "/b0PlSFdDwbyFAJlMe1mDBIOQ2Ae.jpg",
    tags: ["Batman", "DC", "Gotham"],
    franchiseId: "dc",
    accentColor: "#1a1a2e",
    viewingOrders: [
      ...STANDARD_ORDERS,
      { id: "saga", label: "By Era", description: "Grouped by Batman era" }
    ],
    defaultOrder: "chronological",
    entries: [
      { id: "268", media_type: "movie", title: "Batman", release_date: "1989-06-23", poster_path: "/kBf3g9nR2riQ0J7Q3Y0GvY0v0vK.jpg", entryType: "Movie", phase: "Burton Era", order: 0 },
      { id: "215", media_type: "movie", title: "Batman Returns", release_date: "1992-06-19", poster_path: "/jKBtXMpmCZVWfL0vVY0vY0v0vK.jpg", entryType: "Movie", phase: "Burton Era", order: 1 },
      { id: "41430", media_type: "movie", title: "Batman Forever", release_date: "1995-06-16", poster_path: "/z3L7Y9Nc0R3oY0v0vK.jpg", entryType: "Movie", phase: "Schumacher Era", order: 2 },
      { id: "41431", media_type: "movie", title: "Batman & Robin", release_date: "1997-06-20", poster_path: "/v0vY0v0vK.jpg", entryType: "Movie", phase: "Schumacher Era", order: 3 },
      { id: "272", media_type: "movie", title: "Batman Begins", release_date: "2005-06-10", poster_path: "/4MpN4kIEqUjW8OPtOQJXlTdHiJV.jpg", entryType: "Movie", phase: "Nolan Trilogy", order: 4 },
      { id: "155", media_type: "movie", title: "The Dark Knight", release_date: "2008-07-16", poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", entryType: "Movie", phase: "Nolan Trilogy", order: 5 },
      { id: "49026", media_type: "movie", title: "The Dark Knight Rises", release_date: "2012-07-16", poster_path: "/hr0L2aueqlP2BYUblTTjmtn0hw4.jpg", entryType: "Movie", phase: "Nolan Trilogy", order: 6 },
      { id: "414904", media_type: "movie", title: "The Batman", release_date: "2022-03-04", poster_path: "/b0PlSFdDwbyFAJlMe1mDBIOQ2Ae.jpg", entryType: "Movie", phase: "Reeves Era", order: 7 }
    ]
  },
  {
    id: "arrowverse",
    name: "Arrowverse",
    type: "curated",
    description: "The CW's interconnected DC television universe — from Green Arrow to The Flash and beyond.",
    backdrop_path: null,
    tags: ["DC", "TV", "CW"],
    franchiseId: "dc",
    accentColor: "#00FF00",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "1415", media_type: "tv", title: "Arrow", first_air_date: "2012-10-10", poster_path: "/mo0xGNCd1TM3e3R0ovQ0T6q6b5J.jpg", entryType: "Series", phase: "Wave 1", order: 0 },
      { id: "60708", media_type: "tv", title: "The Flash", first_air_date: "2014-10-07", poster_path: "/lJA2RCu4MV0Y5sOcz5O3PQJP7M1.jpg", entryType: "Series", phase: "Wave 1", order: 1 },
      { id: "62104", media_type: "tv", title: "Supergirl", first_air_date: "2015-10-26", poster_path: "/zW1lsJMoHsBvO3qH5sB3O1K3j6P.jpg", entryType: "Series", phase: "Wave 2", order: 2 },
      { id: "62103", media_type: "tv", title: "DC's Legends of Tomorrow", first_air_date: "2016-01-21", poster_path: "/wM1l3qBdV6HHoQXf1Rm1gY3j5pN.jpg", entryType: "Series", phase: "Wave 2", order: 3 }
    ]
  },
  {
    id: "dc-animated",
    name: "DC Animated Universe",
    type: "curated",
    description: "The legendary DC Animated Universe — from Batman: The Animated Series to Justice League Unlimited.",
    backdrop_path: null,
    tags: ["DC", "Animation", "DCAU"],
    franchiseId: "dc",
    accentColor: "#003366",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "31911", media_type: "tv", title: "Batman: The Animated Series", first_air_date: "1992-09-05", poster_path: "/8W2R6v0R3b0J8G3tR6l1P5k0Qm8.jpg", entryType: "Series", phase: "Core", order: 0 },
      { id: "4554", media_type: "tv", title: "Superman: The Animated Series", first_air_date: "1996-09-06", poster_path: "/bR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Series", phase: "Core", order: 1 },
      { id: "31910", media_type: "tv", title: "Justice League", first_air_date: "2001-11-17", poster_path: "/pR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Series", phase: "Justice League", order: 2 },
      { id: "31912", media_type: "tv", title: "Justice League Unlimited", first_air_date: "2004-07-31", poster_path: "/kR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Series", phase: "Justice League", order: 3 }
    ]
  },
  {
    id: "mandoverse",
    name: "Star Wars: Mandoverse",
    type: "curated",
    description: "The Mandalorian-era Star Wars stories — from The Mandalorian to Ahsoka and The Book of Boba Fett.",
    backdrop_path: "/d8duYyyC9J5T825Hg7grmaabfxQ.jpg",
    tags: ["Star Wars", "Mandalorian", "Disney+"],
    franchiseId: "star-wars",
    accentColor: "#B22222",
    viewingOrders: STANDARD_ORDERS,
    defaultOrder: "chronological",
    entries: [
      { id: "82856", media_type: "tv", title: "The Mandalorian", first_air_date: "2019-11-12", poster_path: "/sWgBv7AV2YQ0j2N0J5v2h3p4g5l.jpg", entryType: "Series", phase: "The Mandalorian", order: 0 },
      { id: "115036", media_type: "tv", title: "The Book of Boba Fett", first_air_date: "2021-12-29", poster_path: "/gJ5K2YQ0j2N0J5v2h3p4g5l.jpg", entryType: "Series", phase: "The Mandalorian", order: 1 },
      { id: "114461", media_type: "tv", title: "Ahsoka", first_air_date: "2023-08-22", poster_path: "/hJ5K2YQ0j2N0J5v2h3p4g5l.jpg", entryType: "Series", phase: "The Mandalorian", order: 2 }
    ]
  },
  {
    id: "james-bond",
    name: "James Bond",
    type: "curated",
    description: "The complete 007 saga — from Dr. No to No Time to Die, spanning six decades of espionage cinema.",
    backdrop_path: null,
    tags: ["James Bond", "007", "Spy"],
    franchiseId: "spy-thriller",
    accentColor: "#C0C0C0",
    viewingOrders: [
      ...STANDARD_ORDERS,
      { id: "saga", label: "By Actor", description: "Grouped by Bond actor" }
    ],
    defaultOrder: "chronological",
    entries: [
      { id: "657", media_type: "movie", title: "Dr. No", release_date: "1962-10-05", poster_path: "/hUZg5R6l1P5k0Qm8W2R6v0R3b0J8.jpg", entryType: "Movie", phase: "Connery", order: 0 },
      { id: "661", media_type: "movie", title: "From Russia with Love", release_date: "1963-10-10", poster_path: "/gR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Movie", phase: "Connery", order: 1 },
      { id: "670", media_type: "movie", title: "Goldfinger", release_date: "1964-09-17", poster_path: "/kR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Movie", phase: "Connery", order: 2 },
      { id: "666", media_type: "movie", title: "Thunderball", release_date: "1965-12-09", poster_path: "/pR0M3rQ8dJ5hL0wP1k3N7xQ6jV8.jpg", entryType: "Movie", phase: "Connery", order: 3 },
      { id: "64690", media_type: "movie", title: "Skyfall", release_date: "2012-11-01", poster_path: "/5UXK2H5nGY3nKhlIvQwHPwJXjpV.jpg", entryType: "Movie", phase: "Craig", order: 4 },
      { id: "374720", media_type: "movie", title: "No Time to Die", release_date: "2021-09-30", poster_path: "/iUd7uZxR2P1K3y5h7v9w0X2Y4Z8.jpg", entryType: "Movie", phase: "Craig", order: 5 }
    ]
  }
];
