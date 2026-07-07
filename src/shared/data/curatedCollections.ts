// src/shared/data/curatedCollections.ts
import type { Collection } from "~/shared/types";

/**
 * Curated CineLog Collections — manually ordered collections that mix
 * movies and TV in the correct viewing order.
 *
 * These are NOT TMDB collections. TMDB collections only contain movies
 * and are in release order. Curated CineLog collections can:
 *   - Mix movies and TV shows
 *   - Be in chronological/story order (not release order)
 *   - Include titles from multiple TMDB collections
 *   - Have a custom description and cover image
 *
 * Adding a new curated collection: add an entry to this array. The
 * Collections page will automatically surface it. No code changes needed.
 *
 * ENTRY FORMAT:
 *   Each entry has an `id` (slug), `name`, `description`, optional
 *   `backdrop_path` (TMDB image path for the cover), `tags` for
 *   filtering, and `entries` — an ordered array of titles with their
 *   TMDB id, media_type, and cached display metadata.
 */

export const CURATED_COLLECTIONS: Collection[] = [
  {
    id: "mcu-chronological",
    name: "MCU Chronological Order",
    type: "curated",
    description: "The complete Marvel Cinematic Universe in story chronological order — the way the events unfold within the universe timeline.",
    backdrop_path: "/9BBtojrJ1JyKr3t4mCMzYsBa9eT.jpg",
    tags: ["Marvel", "Superhero", "Chronological"],
    entries: [
      { id: "27205", media_type: "movie", title: "Captain America: The First Avenger", release_date: "2011-07-22", poster_path: "/vSNxAJTlD0r02V9sPYpOjqDZXUK.jpg", order: 0 },
      { id: "1726", media_type: "movie", title: "Iron Man", release_date: "2008-04-30", poster_path: "/78lPtwv72eTNqFW9COBYI0dWDJa.jpg", order: 1 },
      { id: "1724", media_type: "movie", title: "Iron Man 2", release_date: "2010-04-28", poster_path: "/6WBeq4fCfn7ANnsoBcLV9PlhvCp.jpg", order: 2 },
      { id: "10138", media_type: "movie", title: "Thor", release_date: "2011-04-21", poster_path: "/bJZDm6nQc3Y9klJmD4nLp5z6eQj.jpg", order: 3 },
      { id: "1771", media_type: "movie", title: "Captain America: The First Avenger", release_date: "2011-07-22", poster_path: "/vSNxAJTlD0r02V9sPYpOjqDZXUK.jpg", order: 4 },
      { id: "24428", media_type: "movie", title: "The Avengers", release_date: "2012-04-25", poster_path: "/RYMX2wcKCBAr24UyPD7xwmjdTpd.jpg", order: 5 },
      { id: "68721", media_type: "movie", title: "Iron Man 3", release_date: "2013-04-18", poster_path: "/7XiGqZEoMEYJQU3BvW0f6c0wcZd.jpg", order: 6 },
      { id: "76338", media_type: "movie", title: "Thor: The Dark World", release_date: "2013-10-29", poster_path: "/bn4qMHRzC1eKzqnuHk3PjVfIuK6.jpg", order: 7 },
      { id: "100402", media_type: "movie", title: "Captain America: The Winter Soldier", release_date: "2014-03-20", poster_path: "/5TQ6YDmymBpnF005OwpB7T4pWKz.jpg", order: 8 },
      { id: "118340", media_type: "movie", title: "Guardians of the Galaxy", release_date: "2014-07-30", poster_path: "/r7vmZjiyZw9rpJMQJdXljgi5eB0.jpg", order: 9 },
      { id: "99861", media_type: "movie", title: "Avengers: Age of Ultron", release_date: "2015-04-22", poster_path: "/4SSW6qMlJyNh5eONQFBlp1RBqJK.jpg", order: 10 },
      { id: "102899", media_type: "movie", title: "Ant-Man", release_date: "2015-07-14", poster_path: "/D6e8RJf2qUstnf5t0ot0XrtoXc.jpg", order: 11 },
      { id: "277834", media_type: "movie", title: "Captain America: Civil War", release_date: "2016-04-27", poster_path: "/rAGeXeF3Ay9EZ2Q4g4K3cSPYp0h.jpg", order: 12 },
      { id: "315635", media_type: "movie", title: "Spider-Man: Homecoming", release_date: "2017-07-05", poster_path: "/c24sv2weTHPsmDa7jEMN0m2W3O5.jpg", order: 13 },
      { id: "284054", media_type: "movie", title: "Doctor Strange", release_date: "2016-10-20", poster_path: "/4PiiNGXj1KENTmRBMcNkvW2xRsY.jpg", order: 14 },
      { id: "283995", media_type: "movie", title: "Guardians of the Galaxy Vol. 2", release_date: "2017-04-19", poster_path: "/d4hcAuP4nRhnZvwkkk3K9arQwls.jpg", order: 15 },
      { id: "315635", media_type: "movie", title: "Spider-Man: Homecoming", release_date: "2017-07-05", poster_path: "/c24sv2weTHPsmDa7jEMN0m2W3O5.jpg", order: 16 },
      { id: "293660", media_type: "movie", title: "Thor: Ragnarok", release_date: "2017-10-24", poster_path: "/rzRwTcFvttcN1ZpX2xv4j3tUySf.jpg", order: 17 },
      { id: "299536", media_type: "movie", title: "Avengers: Infinity War", release_date: "2018-04-23", poster_path: "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", order: 18 },
      { id: "363088", media_type: "movie", title: "Ant-Man and the Wasp", release_date: "2018-07-04", poster_path: "/eivb8xWHGGM5gnxdEYJfM5DFLZB.jpg", order: 19 },
      { id: "299534", media_type: "movie", title: "Avengers: Endgame", release_date: "2019-04-22", poster_path: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg", order: 20 },
      { id: "429617", media_type: "movie", title: "Spider-Man: Far From Home", release_date: "2019-06-28", poster_path: "/4q2NNj4S5dGsuRLFVP127uJd8hn.jpg", order: 21 }
    ]
  },
  {
    id: "star-wars-timeline",
    name: "Star Wars Timeline",
    type: "curated",
    description: "The complete Star Wars saga in chronological story order, from The Phantom Menace to The Rise of Skywalker.",
    backdrop_path: "/d8duYyyC9J5T825Hg7grmaabfxQ.jpg",
    tags: ["Star Wars", "Sci-Fi", "Chronological"],
    entries: [
      { id: "1893", media_type: "movie", title: "Star Wars: Episode I - The Phantom Menace", release_date: "1999-05-19", poster_path: "/n8D09WDVP1TrQxR5hcWVicdX5Nw.jpg", order: 0 },
      { id: "1894", media_type: "movie", title: "Star Wars: Episode II - Attack of the Clones", release_date: "2002-05-15", poster_path: "/k3IM8aA7iEU8RBXLDFFGT9R1nUy.jpg", order: 1 },
      { id: "1895", media_type: "movie", title: "Star Wars: Episode III - Revenge of the Sith", release_date: "2005-05-17", poster_path: "/tUS8M6HoAb7qL0wk2hj8lUi6TJe.jpg", order: 2 },
      { id: "11", media_type: "movie", title: "Star Wars: Episode IV - A New Hope", release_date: "1977-05-25", poster_path: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg", order: 3 },
      { id: "1891", media_type: "movie", title: "Star Wars: Episode V - The Empire Strikes Back", release_date: "1980-05-17", poster_path: "/7BuH8itoSrLExs2YZSsM01Qk2no.jpg", order: 4 },
      { id: "1892", media_type: "movie", title: "Star Wars: Episode VI - Return of the Jedi", release_date: "1983-05-25", poster_path: "/jxWpM1jZC9npT2nFUCUM5b5B9vx.jpg", order: 5 },
      { id: "140607", media_type: "movie", title: "Star Wars: The Force Awakens", release_date: "2015-12-15", poster_path: "/wqnqdwzBCu6egxoyWqGqkLtYjyk.jpg", order: 6 },
      { id: "181808", media_type: "movie", title: "Star Wars: The Last Jedi", release_date: "2017-12-09", poster_path: "/kOVEVeg59EUnweXtt2iNBdd2rPo.jpg", order: 7 },
      { id: "181812", media_type: "movie", title: "Star Wars: The Rise of Skywalker", release_date: "2019-12-18", poster_path: "/AdYJmnSnmBJBrrL4HhaWBc6ysO6.jpg", order: 8 }
    ]
  },
  {
    id: "middle-earth",
    name: "Middle Earth",
    type: "curated",
    description: "The complete Middle Earth saga — The Lord of the Rings and The Hobbit trilogies in story chronological order.",
    backdrop_path: "/9deGfFCcrun4q3OFCb4zOhmRJ6P.jpg",
    tags: ["Fantasy", "LOTR", "Hobbit"],
    entries: [
      { id: "121", media_type: "movie", title: "The Hobbit: An Unexpected Journey", release_date: "2012-11-28", poster_path: "/y7ep7lhPcUl7w5XpIuKLfvQRQ4v.jpg", order: 0 },
      { id: "122", media_type: "movie", title: "The Hobbit: The Desolation of Smaug", release_date: "2013-12-02", poster_path: "/9U9Y5GQuWX3EZy39B8nkk4NY01S.jpg", order: 1 },
      { id: "123", media_type: "movie", title: "The Hobbit: The Battle of the Five Armies", release_date: "2014-12-01", poster_path: "/cxU3vN6j6yiMB8O2iVh0U5c4u5d.jpg", order: 2 },
      { id: "120", media_type: "movie", title: "The Lord of the Rings: The Fellowship of the Ring", release_date: "2001-12-18", poster_path: "/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg", order: 3 },
      { id: "121", media_type: "movie", title: "The Lord of the Rings: The Two Towers", release_date: "2002-12-18", poster_path: "/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg", order: 4 },
      { id: "122", media_type: "movie", title: "The Lord of the Rings: The Return of the King", release_date: "2003-12-01", poster_path: "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg", order: 5 }
    ]
  },
  {
    id: "dark-knight-trilogy",
    name: "The Dark Knight Trilogy",
    type: "curated",
    description: "Christopher Nolan's complete Batman saga — from Batman Begins to The Dark Knight Rises.",
    backdrop_path: "/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg",
    tags: ["Batman", "Nolan", "DC"],
    entries: [
      { id: "272", media_type: "movie", title: "Batman Begins", release_date: "2005-06-10", poster_path: "/4MpN4kIEqUjW8OPtOQJXlTdHiJV.jpg", order: 0 },
      { id: "155", media_type: "movie", title: "The Dark Knight", release_date: "2008-07-16", poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", order: 1 },
      { id: "49026", media_type: "movie", title: "The Dark Knight Rises", release_date: "2012-07-16", poster_path: "/hr0L2aueqlP2BYUblTTjmtn0hw4.jpg", order: 2 }
    ]
  },
  {
    id: "john-wick",
    name: "John Wick Saga",
    type: "curated",
    description: "The complete John Wick saga — from the original to Chapter 4.",
    backdrop_path: "/h3KN24PrOheHVYs9ypuOIdFBEpX.jpg",
    tags: ["Action", "Keanu"],
    entries: [
      { id: "245891", media_type: "movie", title: "John Wick", release_date: "2014-10-24", poster_path: "/fZPSd91yGE9fCcBy6GlmKtPpc7E.jpg", order: 0 },
      { id: "324552", media_type: "movie", title: "John Wick: Chapter 2", release_date: "2017-02-08", poster_path: "/hXWBc0ioZfRdr2f5y8aX5z9tHjk.jpg", order: 1 },
      { id: "524047", media_type: "movie", title: "John Wick: Chapter 3 - Parabellum", release_date: "2019-05-15", poster_path: "/vV36nfql6PcmRfH4m1A27s9VKS.jpg", order: 2 },
      { id: "603692", media_type: "movie", title: "John Wick: Chapter 4", release_date: "2023-03-22", poster_path: "/7I6VUdPj6tQECNHdviJkUHD2u89.jpg", order: 3 }
    ]
  }
];
