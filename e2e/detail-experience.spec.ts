import { expect, test, type Page } from "@playwright/test";

const movieDetail = {
  id: 101,
  title: "House of the Dragon",
  original_title: "House of the Dragon",
  tagline: "The history of the Targaryen civil war.",
  overview:
    "The Targaryen dynasty is at the absolute apex of its power, with more than 15 dragons under their yoke.",
  poster_path: "/house-poster.jpg",
  backdrop_path: "/house-backdrop.jpg",
  release_date: "2022-01-01",
  runtime: 67,
  media_type: "movie",
  genres: [
    { id: 1, name: "Sci-Fi & Fantasy" },
    { id: 2, name: "Drama" },
    { id: 3, name: "Action & Adventure" }
  ],
  vote_average: 8.4,
  vote_count: 1000,
  videos: {
    results: [
      {
        key: "house-trailer",
        site: "YouTube",
        type: "Trailer",
        official: true,
        name: "House of the Dragon Official Trailer",
        published_at: "2022-01-01T00:00:00.000Z"
      }
    ]
  },
  credits: { cast: [], crew: [] },
  production_countries: [
    { iso_3166_1: "US", name: "United States of America" }
  ],
  production_companies: [{ id: 1, name: "HBO" }],
  spoken_languages: [
    { english_name: "English", iso_639_1: "en", name: "English" }
  ]
};

const tvDetail = {
  ...movieDetail,
  id: 202,
  title: undefined,
  original_title: undefined,
  name: "House of the Dragon",
  original_name: "House of the Dragon",
  first_air_date: "2022-01-01",
  release_date: undefined,
  runtime: undefined,
  episode_run_time: [60],
  media_type: "tv",
  number_of_seasons: 3,
  number_of_episodes: 26,
  seasons: [
    {
      id: 1,
      name: "Season 1",
      season_number: 1,
      episode_count: 10,
      air_date: "2022-01-01",
      poster_path: null
    },
    {
      id: 2,
      name: "Season 2",
      season_number: 2,
      episode_count: 8,
      air_date: "2024-01-01",
      poster_path: null
    }
  ],
  status: "Returning Series"
};

const noTrailerDetail = {
  ...movieDetail,
  id: 303,
  title: "A Film Without a Trailer",
  backdrop_path: null,
  videos: { results: [] }
};

const complexDetail = {
  ...movieDetail,
  id: 404,
  title:
    "The Incredibly Long International Title That Must Stay Readable on Every Screen",
  tagline: "",
  poster_path: null,
  backdrop_path: null,
  videos: { results: [] },
  genres: [
    { id: 1, name: "Action & Adventure" },
    { id: 2, name: "Sci-Fi & Fantasy" },
    { id: 3, name: "Drama" },
    { id: 4, name: "Mystery" },
    { id: 5, name: "Thriller" },
    { id: 6, name: "War" }
  ]
};

const ambientVariantDetails = [
  {
    ...movieDetail,
    id: 505,
    title: "In the Grey",
    backdrop_path: "/in-the-grey-blue-backdrop.jpg"
  },
  {
    ...movieDetail,
    id: 606,
    title: "Prismatic Color",
    backdrop_path: "/prismatic-color-backdrop.jpg"
  },
  {
    ...movieDetail,
    id: 808,
    title: "The Devil Wears Prada 2",
    backdrop_path: "/devil-prada-bright-red-backdrop.jpg"
  },
  {
    ...movieDetail,
    id: 707,
    title: "A Dark Night",
    backdrop_path: "/a-dark-night-backdrop.jpg"
  }
];

async function mockDetailApi(page: Page) {
  await page.route("https://image.tmdb.org/**", async (route) => {
    const imageUrl = new URL(route.request().url());
    const imagePath = imageUrl.pathname;
    const isPoster = imagePath.includes("w342");
    const backdropStops = imagePath.includes("in-the-grey")
      ? ["#184d63", "#5eabb1", "#11282f"]
      : imagePath.includes("devil-prada")
        ? ["#f1eee8", "#c8c8c5", "#8d1725"]
        : imagePath.includes("prismatic-color")
          ? ["#7d195b", "#e26b2d", "#1c5d91"]
          : imagePath.includes("a-dark-night")
            ? ["#101116", "#292329", "#3b2923"]
            : ["#10242d", "#4f5137", "#130f13"];
    const artwork = isPoster
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"><defs><linearGradient id="poster" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#173b3a"/><stop offset="0.52" stop-color="#6d4a2b"/><stop offset="1" stop-color="#080b11"/></linearGradient></defs><rect width="342" height="513" fill="url(#poster)"/><circle cx="220" cy="188" r="98" fill="#c2a269" fill-opacity=".28"/><path d="M42 424c70-132 142-132 258 0" fill="none" stroke="#e8d7ad" stroke-opacity=".4" stroke-width="12"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${backdropStops[0]}"/><stop offset="0.48" stop-color="${backdropStops[1]}"/><stop offset="1" stop-color="${backdropStops[2]}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#backdrop)"/><circle cx="870" cy="250" r="170" fill="#ffffff" fill-opacity=".2"/><path d="M0 560c220-150 390-110 620 8s410 94 660-62v214H0z" fill="#05080d" fill-opacity=".38"/></svg>`;
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: artwork
    });
  });

  await page.route("**/api/media/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/search/multi")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              ...movieDetail,
              title: "House of the Dragon Movie",
              media_type: "movie"
            },
            {
              ...noTrailerDetail,
              media_type: "movie"
            },
            {
              ...tvDetail,
              title: undefined,
              name: "House of the Dragon TV",
              media_type: "tv"
            },
            {
              ...complexDetail,
              media_type: "movie"
            },
            ...ambientVariantDetails.map((detail) => ({
              ...detail,
              media_type: "movie"
            }))
          ],
          total_results: 8
        })
      });
      return;
    }

    if (path.endsWith("/search/person")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ results: [] })
      });
      return;
    }

    if (path.includes("/ratings")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({})
      });
      return;
    }

    if (path.endsWith("/movie/101")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(movieDetail)
      });
      return;
    }

    if (path.endsWith("/tv/202")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(tvDetail)
      });
      return;
    }

    if (path.endsWith("/movie/303")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(noTrailerDetail)
      });
      return;
    }

    if (path.endsWith("/movie/404")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(complexDetail)
      });
      return;
    }

    const ambientVariant = ambientVariantDetails.find((detail) =>
      path.endsWith(`/movie/${detail.id}`)
    );
    if (ambientVariant) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(ambientVariant)
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ results: [] })
    });
  });
}

async function openFixtureFromSearch(page: Page, titlePattern: RegExp) {
  await page.goto("/search?q=House");
  const results = page.locator(".search-result-main");
  const result = page.getByRole("button", {
    name: new RegExp(`${titlePattern.source}.*open details`, titlePattern.flags)
  });
  await expect(results).toHaveCount(8);
  await result.click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
]) {
  test.describe(`Dedicated detail experience at ${viewport.width}x${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockDetailApi(page);
    });

    test("renders an artwork-led movie hero with stable trailer swap", async ({
      page
    }) => {
      await openFixtureFromSearch(page, /House of the Dragon Movie/);

      const shell = page.locator(".details-page-shell");
      const hero = page.locator(".cinematic-hero");
      await expect(shell).toBeVisible();
      await expect(hero).toBeVisible();
      await expect(page.locator(".app-shell-bg")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)"
      );
      const ambientLayers = await shell.evaluate((element) => {
        const ambient = getComputedStyle(element, "::before");
        const veil = getComputedStyle(element, "::after");
        const scroll = getComputedStyle(
          element.querySelector(".details-page-scroll")
        );
        return {
          ambientImage: ambient.backgroundImage,
          ambientFilter: ambient.filter,
          ambientTop: ambient.top,
          ambientBottom: ambient.bottom,
          veilImage: veil.backgroundImage,
          scrollBackground: scroll.backgroundColor
        };
      });
      expect(ambientLayers.ambientImage).toContain("url(");
      expect(ambientLayers.ambientFilter).toContain("blur(52px)");
      expect(ambientLayers.ambientTop).toBe("0px");
      expect(ambientLayers.ambientBottom).toBe("0px");
      expect(ambientLayers.veilImage).toContain("linear-gradient");
      expect(ambientLayers.scrollBackground).toBe("rgba(0, 0, 0, 0)");
      await expect(page.locator(".cinematic-hero-back")).toHaveAccessibleName(
        "Back to previous page"
      );
      await expect(
        page.getByRole("button", { name: "Watch trailer" })
      ).toBeVisible();
      await expect(page.locator(".cinematic-hero-trailer-toggle")).toHaveCount(
        0
      );
      await expect(page.locator(".hero-content-cluster")).toBeVisible();
      await expect(page.locator(".action-dock")).toBeVisible();
      await expect(page.locator(".bottom-nav-glass:visible")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);

      const ambientImage = await shell.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--detail-ambient-image")
      );
      expect(ambientImage).toContain("url(");

      const heroBefore = await hero.boundingBox();
      await page.getByRole("button", { name: "Watch trailer" }).click();
      await expect(page.locator(".cinematic-trailer-player")).toBeVisible();
      await expect(page.locator(".cinematic-trailer-iframe")).toBeVisible();
      const ambientImageDuringTrailer = await shell.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage
      );
      expect(ambientImageDuringTrailer).toBe(ambientLayers.ambientImage);
      await expect(
        page.getByRole("button", { name: "Watch trailer" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Close trailer" })
      ).toBeVisible();

      const heroDuring = await hero.boundingBox();
      expect(heroDuring?.height).toBe(heroBefore?.height);

      await page.getByRole("button", { name: "Close trailer" }).click();
      await expect(page.locator(".cinematic-trailer-player")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Watch trailer" })
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: `test-results/detail-movie-${viewport.width}x${viewport.height}.png`,
        fullPage: true
      });
    });

    test("adapts ambient color and luminance without changing the artwork source", async ({
      page
    }) => {
      const profiles: Record<
        string,
        {
          primary: string;
          neutral: string;
          opacity: number;
          brightness: number;
          veilBottom: number;
          surfaceMix: number;
        }
      > = {};

      for (const title of [
        "The Devil Wears Prada 2",
        "In the Grey",
        "Prismatic Color",
        "House of the Dragon Movie",
        "A Dark Night"
      ]) {
        await openFixtureFromSearch(page, new RegExp(title));
        const shell = page.locator(".details-page-shell");
        await expect
          .poll(() =>
            shell.evaluate((element) =>
              getComputedStyle(element).getPropertyValue(
                "--detail-ambient-profile-ready"
              )
            )
          )
          .toBe("1");
        profiles[title] = await shell.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            primary: styles.getPropertyValue("--detail-ambient-primary").trim(),
            neutral: styles.getPropertyValue("--detail-ambient-neutral").trim(),
            opacity: Number(
              styles.getPropertyValue("--detail-ambient-image-opacity")
            ),
            brightness: Number(
              styles.getPropertyValue("--detail-ambient-image-brightness")
            ),
            veilBottom: Number(
              styles.getPropertyValue("--detail-ambient-veil-bottom")
            ),
            surfaceMix: Number.parseFloat(
              styles.getPropertyValue("--detail-ambient-surface-mix")
            )
          };
        });
      }

      expect(profiles["The Devil Wears Prada 2"].neutral).not.toBe(
        profiles["A Dark Night"].neutral
      );
      expect(profiles["The Devil Wears Prada 2"].opacity).toBeGreaterThan(
        profiles["A Dark Night"].opacity
      );
      expect(profiles["The Devil Wears Prada 2"].brightness).toBeGreaterThan(
        profiles["A Dark Night"].brightness
      );
      expect(profiles["The Devil Wears Prada 2"].veilBottom).toBeLessThan(
        profiles["A Dark Night"].veilBottom
      );
      expect(profiles["The Devil Wears Prada 2"].surfaceMix).toBeGreaterThan(
        profiles["A Dark Night"].surfaceMix
      );
      expect(profiles["In the Grey"].primary).not.toBe(
        profiles["House of the Dragon Movie"].primary
      );
      expect(profiles["Prismatic Color"].primary).not.toBe(
        profiles["In the Grey"].primary
      );
    });

    test("keeps ambient source title-specific across backdrop variants", async ({
      page
    }) => {
      for (const variant of ambientVariantDetails) {
        await openFixtureFromSearch(page, new RegExp(variant.title));

        const shell = page.locator(".details-page-shell");
        await expect(shell).toBeVisible();
        const ambientImage = await shell.evaluate(
          (element) => getComputedStyle(element, "::before").backgroundImage
        );
        expect(ambientImage).toContain(variant.backdrop_path);
        expect(
          await shell.evaluate(
            (element) => getComputedStyle(element).backgroundColor
          )
        ).toBe("rgb(7, 10, 16)");
        await expectNoHorizontalOverflow(page);
      }
    });

    test("keeps TV episodes and responsive page structure intact", async ({
      page
    }) => {
      await openFixtureFromSearch(page, /House of the Dragon TV/);

      await expect(page.locator(".details-page-shell")).toBeVisible();
      await expect(page.locator(".hero-content-cluster")).toContainText(
        "House of the Dragon"
      );
      await expect(
        page.locator(".detail-section").filter({ hasText: "Episode Guide" })
      ).toBeVisible();
      await expect(page.locator(".cinematic-hero-back")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test("keeps long titles, sparse metadata, many genres, and missing posters safe", async ({
      page
    }) => {
      await openFixtureFromSearch(
        page,
        /The Incredibly Long International Title/
      );

      await expect(page.locator(".details-page-shell")).toBeVisible();
      await expect(page.locator(".hero-title")).toContainText(
        "The Incredibly Long International Title"
      );
      await expect(page.locator(".hero-tagline")).toHaveCount(0);
      await expect(page.locator(".floating-poster img")).toHaveCount(0);
      await expect(
        page.locator(".floating-poster .material-symbols-outlined")
      ).toBeVisible();
      await expect(page.locator(".hero-title")).toHaveCSS("overflow", "hidden");
      await expect(page.locator(".hero-quick-meta .v2-pill")).toHaveCount(6);
      await expectNoHorizontalOverflow(page);
    });

    test("renders a clean no-trailer hero when backdrop and trailer data are missing", async ({
      page
    }) => {
      await openFixtureFromSearch(page, /A Film Without a Trailer/);

      const shell = page.locator(".details-page-shell");
      await expect(shell).toBeVisible();
      await expect(page.locator(".cinematic-hero-media")).toBeVisible();
      await expect(page.locator(".app-shell-bg")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)"
      );
      await expect(
        page.getByRole("button", { name: "Watch trailer" })
      ).toHaveCount(0);
      await expect(page.locator(".cinematic-hero-trailer-toggle")).toHaveCount(
        0
      );
      const fallbackLayers = await shell.evaluate((element) => ({
        shellBackground: getComputedStyle(element).backgroundColor,
        ambientImage: getComputedStyle(element, "::before").backgroundImage,
        ambientSource: getComputedStyle(element).getPropertyValue(
          "--detail-ambient-image"
        ),
        scrollBackground: getComputedStyle(
          element.querySelector(".details-page-scroll")
        ).backgroundColor
      }));
      expect(fallbackLayers.shellBackground).toBe("rgb(7, 10, 16)");
      expect(fallbackLayers.ambientImage).toContain("none");
      expect(fallbackLayers.ambientSource).toBe("none");
      expect(fallbackLayers.scrollBackground).toBe("rgba(0, 0, 0, 0)");
      await expect
        .poll(() =>
          shell.evaluate((element) =>
            getComputedStyle(element).getPropertyValue(
              "--detail-ambient-profile-ready"
            )
          )
        )
        .toBe("0");
      await expect
        .poll(() =>
          shell.evaluate((element) =>
            getComputedStyle(element).getPropertyValue(
              "--detail-ambient-neutral"
            )
          )
        )
        .toBe("28 34 44");
      await expectNoHorizontalOverflow(page);
    });
  });
}
