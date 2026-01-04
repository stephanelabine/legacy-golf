function jitter(seed, scale) {
  const x = Math.sin(seed) * 10000;
  return (x - Math.floor(x)) * scale;
}

export function buildMockCourse(name, center) {
  const baseLat = center?.lat ?? 49.2;
  const baseLon = center?.lon ?? -122.9;

  const holes = Array.from({ length: 18 }).map((_, i) => {
    const n = i + 1;

    const tee = {
      lat: baseLat + jitter(n * 11.1, 0.008) - 0.004,
      lon: baseLon + jitter(n * 22.2, 0.010) - 0.005,
    };

    const greenC = {
      lat: tee.lat + (0.0035 + jitter(n * 33.3, 0.004)),
      lon: tee.lon + (0.0030 + jitter(n * 44.4, 0.004)),
    };

    return {
      number: n,
      par: [4, 4, 3, 5][n % 4],
      handicap: ((n * 7) % 18) + 1,
      tee,
      green: {
        front: { lat: greenC.lat - 0.00015, lon: greenC.lon - 0.00008 },
        middle: { lat: greenC.lat, lon: greenC.lon },
        back: { lat: greenC.lat + 0.00015, lon: greenC.lon + 0.00008 },
      },
    };
  });

  return { id: `mock-${String(name).toLowerCase().replace(/\s+/g, "-")}`, name, center: { lat: baseLat, lon: baseLon }, holes };
}
