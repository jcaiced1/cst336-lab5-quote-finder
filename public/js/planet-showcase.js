const cards = [...document.querySelectorAll("[data-planet-preview]")];
const panels = [...document.querySelectorAll("[data-planet-panel]")];
const marquee = document.querySelector(".planet-marquee");
const track = document.querySelector(".planet-marquee-track");
const firstGroup = document.querySelector(".planet-marquee-group");

if (cards.length && panels.length) {
  function setActivePlanet(index, highlightCard = true) {
    panels.forEach((panel) => {
      panel.classList.toggle(
        "is-active",
        panel.dataset.planetPanel === String(index)
      );
    });

    cards.forEach((card) => {
      card.classList.toggle(
        "is-active",
        highlightCard && card.dataset.planetPreview === String(index)
      );
    });
  }

  cards.forEach((card) => {
    const index = Number(card.dataset.planetPreview);

    card.addEventListener("pointerenter", () => setActivePlanet(index));
    card.addEventListener("focus", () => setActivePlanet(index));
  });

  marquee?.addEventListener("pointerleave", () => {
    cards.forEach((card) => card.classList.remove("is-active"));
  });

  setActivePlanet(0, false);
}

if (marquee && track && firstGroup) {
  let offset = 0;
  let previousFrame = 0;
  let paused = false;
  let groupWidth = 0;
  const speed = 0.035;

  function measureGroup() {
    groupWidth = firstGroup.getBoundingClientRect().width;

    if (groupWidth > 0) {
      offset = ((offset % groupWidth) + groupWidth) % groupWidth;
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }
  }

  function animate(frameTime) {
    if (!previousFrame) {
      previousFrame = frameTime;
    }

    const delta = frameTime - previousFrame;
    previousFrame = frameTime;

    if (!paused && groupWidth > 0) {
      offset += delta * speed;

      if (offset >= groupWidth) {
        offset -= groupWidth;
      }

      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }

    window.requestAnimationFrame(animate);
  }

  marquee.addEventListener("pointerenter", () => {
    paused = true;
  });

  marquee.addEventListener("pointerleave", () => {
    paused = false;
  });

  window.addEventListener("resize", measureGroup);

  measureGroup();
  window.requestAnimationFrame(animate);
}
