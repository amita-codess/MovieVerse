/**
 * MovieVerse - Client-side Interactive Engine
 * Handles REST API communication with Spring Boot backend, Auth, and Favourites
 */

// Current Auth State Helper
const Auth = {
  getUser() {
    try {
      const data = localStorage.getItem("movieverse_user");
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem("movieverse_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("movieverse_user");
    }
    this.updateNavbar();
  },

  isLoggedIn() {
    return this.getUser() !== null;
  },

  logout() {
    localStorage.removeItem("movieverse_user");
    localStorage.removeItem("movieverse_fav_ids");
    Toast.show("Logged out successfully", "info");
    this.updateNavbar();
    // Redirect if on favourites page
    if (window.location.pathname.includes("favourites")) {
      window.location.href = "login.html";
    } else {
      window.location.reload();
    }
  },

  updateNavbar() {
    const user = this.getUser();
    const authContainer = document.getElementById("navbarAuthSection");
    if (!authContainer) return;

    if (user) {
      authContainer.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-mv-secondary dropdown-toggle py-1 px-3" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-person-circle text-danger me-1"></i>
            <span class="d-none d-sm-inline">${escapeHtml(user.name.split(" ")[0])}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-lg">
            <li><h6 class="dropdown-header text-truncate" style="max-width: 200px;">${escapeHtml(user.email)}</h6></li>
            <li><a class="dropdown-item" href="favourites.html"><i class="bi bi-heart-fill text-danger me-2"></i>My Favourites</a></li>
            <li><a class="dropdown-item" href="about.html"><i class="bi bi-info-circle me-2"></i>About MovieVerse</a></li>
            <li><hr class="dropdown-divider border-secondary"></li>
            <li><button class="dropdown-item text-danger" onclick="Auth.logout()"><i class="bi bi-box-arrow-right me-2"></i>Logout</button></li>
          </ul>
        </div>
      `;
    } else {
      authContainer.innerHTML = `
        <a href="login.html" class="btn btn-outline-light btn-sm me-2 fw-semibold px-3">Login</a>
        <a href="register.html" class="btn btn-mv-primary btn-sm fw-semibold px-3">Register</a>
      `;
    }
  }
};

// Favourites State Cache & Sync
const Favourites = {
  favMovieIds: new Set(),

  async init() {
    const user = Auth.getUser();
    if (!user) {
      this.favMovieIds.clear();
      return;
    }

    try {
      const res = await fetch(`/api/favourites/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        this.favMovieIds = new Set(data.map(item => item.movie.id));
        localStorage.setItem("movieverse_fav_ids", JSON.stringify(Array.from(this.favMovieIds)));
      }
    } catch (e) {
      console.warn("Failed to fetch favourites:", e);
      try {
        const cached = localStorage.getItem("movieverse_fav_ids");
        if (cached) {
          this.favMovieIds = new Set(JSON.parse(cached));
        }
      } catch (err) {}
    }
  },

  isFav(movieId) {
    return this.favMovieIds.has(Number(movieId));
  },

  async toggle(movieId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const user = Auth.getUser();
    if (!user) {
      Toast.show("Please login to add movies to your favourites!", "warning");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);
      return;
    }

    const id = Number(movieId);
    const currentlyFav = this.isFav(id);

    try {
      if (currentlyFav) {
        // DELETE
        const res = await fetch(`/api/favourites/${user.id}/${id}`, {
          method: "DELETE"
        });
        if (res.ok) {
          this.favMovieIds.delete(id);
          this.updateUi(id, false);
          Toast.show("Removed from favourites", "info");
        } else {
          Toast.show("Failed to remove favourite", "danger");
        }
      } else {
        // POST
        const res = await fetch(`/api/favourites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, movieId: id })
        });
        if (res.ok) {
          this.favMovieIds.add(id);
          this.updateUi(id, true);
          Toast.show("Added to favourites! ❤️", "success");
        } else {
          const err = await res.json();
          Toast.show(err.message || "Failed to add favourite", "danger");
        }
      }
      localStorage.setItem("movieverse_fav_ids", JSON.stringify(Array.from(this.favMovieIds)));
    } catch (err) {
      console.error(err);
      Toast.show("Network error while updating favourite", "danger");
    }
  },

  updateUi(movieId, isFav) {
    const buttons = document.querySelectorAll(`.fav-btn-${movieId}`);
    buttons.forEach(btn => {
      if (isFav) {
        btn.classList.add("is-fav");
        btn.innerHTML = `<i class="bi bi-heart-fill text-white"></i>`;
        btn.setAttribute("title", "Remove from Favourites");
      } else {
        btn.classList.remove("is-fav");
        btn.innerHTML = `<i class="bi bi-heart"></i>`;
        btn.setAttribute("title", "Add to Favourites");
      }
    });

    const detailBtn = document.getElementById(`detailsFavBtn`);
    if (detailBtn && detailBtn.dataset.movieId == movieId) {
      if (isFav) {
        detailBtn.className = "btn btn-danger btn-lg px-4 fw-bold";
        detailBtn.innerHTML = `<i class="bi bi-heart-fill me-2"></i> In Favourites`;
      } else {
        detailBtn.className = "btn btn-mv-primary btn-lg px-4 fw-bold";
        detailBtn.innerHTML = `<i class="bi bi-heart me-2"></i> Add to Favourite`;
      }
    }
  }
};

// UI Toast Notification System
const Toast = {
  show(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const icons = {
      success: "bi-check-circle-fill text-success",
      warning: "bi-exclamation-triangle-fill text-warning",
      danger: "bi-x-circle-fill text-danger",
      info: "bi-info-circle-fill text-info"
    };

    const toastEl = document.createElement("div");
    toastEl.className = "toast toast-mv align-items-center show fade mb-2";
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");
    
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${icons[type] || icons.info} fs-5"></i>
          <span>${escapeHtml(message)}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    container.appendChild(toastEl);

    // Auto remove after 3.5s
    setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);

    toastEl.querySelector(".btn-close").addEventListener("click", () => {
      toastEl.remove();
    });
  }
};

// Helper: Escape HTML to avoid XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Generate Standard Movie Card HTML (Bootstrap 5)
function createMovieCardHtml(movie) {
  const isFav = Favourites.isFav(movie.id);
  const releaseYear = movie.releaseDate ? movie.releaseDate.split("-")[0] : "";
  const primaryGenre = movie.genre ? movie.genre.split(",")[0].trim() : "Movie";

  return `
    <div class="col-6 col-md-4 col-lg-3 col-xl-2-4 mb-4">
      <div class="movie-card" id="movie-card-${movie.id}">
        <div class="poster-wrapper">
          <img src="${escapeHtml(movie.posterUrl)}" alt="${escapeHtml(movie.title)}" class="poster-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80'">
          <div class="card-rating-badge">
            <i class="bi bi-star-fill"></i> ${movie.rating.toFixed(1)}
          </div>
          <button class="card-fav-btn fav-btn-${movie.id} ${isFav ? 'is-fav' : ''}" 
                  onclick="Favourites.toggle(${movie.id}, event)" 
                  title="${isFav ? 'Remove from Favourites' : 'Add to Favourites'}"
                  aria-label="Toggle Favourite">
            <i class="bi ${isFav ? 'bi-heart-fill' : 'bi-heart'}"></i>
          </button>
        </div>
        <div class="movie-card-body">
          <a href="movie-details.html?id=${movie.id}" class="movie-card-title" title="${escapeHtml(movie.title)}">
            ${escapeHtml(movie.title)}
          </a>
          <div class="movie-card-meta">
            <span class="text-white-50"><i class="bi bi-calendar3 me-1"></i>${releaseYear}</span>
            <span class="movie-genre-badge">${escapeHtml(primaryGenre)}</span>
          </div>
          <div class="movie-card-actions">
            <a href="movie-details.html?id=${movie.id}" class="btn btn-mv-primary btn-sm w-100 justify-content-center">
              <i class="bi bi-play-circle"></i> View Details
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Global Nav Search handler
function setupNavSearch() {
  const form = document.getElementById("navSearchForm");
  const input = document.getElementById("navSearchInput");
  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        window.location.href = `movies.html?search=${encodeURIComponent(q)}`;
      }
    });
  }
}

// Highlight active nav item
function setActiveNavLink() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".navbar-mv .nav-link");
  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === path || (path === "" && href === "index.html") || (path === "/" && href === "index.html")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

// Global initialization
document.addEventListener("DOMContentLoaded", async () => {
  Auth.updateNavbar();
  await Favourites.init();
  setupNavSearch();
  setActiveNavLink();
});
