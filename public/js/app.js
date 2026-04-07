const modalBody = document.getElementById("authorModalBody");
const authorModal = document.getElementById("authorModal");

if (authorModal && modalBody) {
  authorModal.addEventListener("show.bs.modal", async (event) => {
    const trigger = event.relatedTarget;
    const authorId = trigger?.getAttribute("data-author-id");

    if (!authorId) {
      modalBody.textContent = "Author details are unavailable.";
      return;
    }

    modalBody.textContent = "Loading author details...";

    try {
      const response = await fetch(`/api/authors/${authorId}`);
      if (!response.ok) {
        throw new Error("Request failed");
      }

      const author = await response.json();
      const safePortrait = author.portraitUrl || author.fallbackPortraitUrl;
      modalBody.innerHTML = `
        <article class="author-profile">
          <img src="${safePortrait}" alt="${author.name} portrait" data-fallback-src="${author.fallbackPortraitUrl}">
          <div>
            <p class="section-kicker">Author Profile</p>
            <h3>${author.name}</h3>
            <div class="author-facts">
              <span>${author.nationality}</span>
              <span>${author.displayYears}</span>
              <span>${author.quoteCount} quotes in database</span>
              <span>${author.highestLikes} top likes</span>
            </div>
            <p>${author.bio}</p>
          </div>
        </article>
      `;

      const portrait = modalBody.querySelector("img[data-fallback-src]");
      if (portrait) {
        portrait.addEventListener(
          "error",
          () => {
            portrait.src = portrait.dataset.fallbackSrc;
          },
          { once: true }
        );
      }
    } catch (error) {
      modalBody.textContent = "Unable to load this author right now.";
    }
  });
}
