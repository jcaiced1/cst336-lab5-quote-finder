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
      modalBody.innerHTML = `
        <article class="author-profile">
          <img src="${author.portraitUrl}" alt="${author.name} portrait">
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
            <p><strong>Why this author matters here:</strong> ${author.spotlight}</p>
          </div>
        </article>
      `;
    } catch (error) {
      modalBody.textContent = "Unable to load this author right now.";
    }
  });
}
