/**
 * MovieVerse - Client-side Interactive Engine
 * Handles REST API communication with Spring Boot backend, Auth, and Favourites
 */

// Clean MovieVerse SVG Placeholder for missing/broken posters
const POSTER_FALLBACK_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <rect width="300" height="450" fill="#141414"/>
  <rect x="10" y="10" width="280" height="430" rx="8" fill="#1f1f1f" stroke="#333333" stroke-width="1.5"/>
  <g transform="translate(150, 185)">
    <circle cx="0" cy="0" r="38" fill="#292929" stroke="#3a3a3a" stroke-width="2"/>
    <path d="M-8 -14 L14 0 L-8 14 Z" fill="#e50914"/>
  </g>
  <text x="150" y="260" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#f0f0f0" text-anchor="middle">Poster Not Available</text>
  <text x="150" y="285" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#888888" text-anchor="middle">MovieVerse</text>
</svg>
`.trim());

// Helper to determine clean poster URL
function getValidPosterUrl(url) {
  if (!url || url === "N/A" || typeof url !== "string" || url.trim() === "" || url.includes("unsplash.com")) {
    return POSTER_FALLBACK_SVG;
  }
  return url;
}

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
    if (window.location.pathname.includes("favourites")) {
      window.location.href = "login.html";
    } else {
      window.location.reload();
    }
  },

  updateNavbar() {
    const user = this.getUser();
    const authContainers = document.querySelectorAll("#navbarAuthSection, #mobileNavbarAuthSection");
    
    authContainers.forEach(container => {
      if (!container) return;
      if (user) {
        const firstName = escapeHtml(user.name.split(" ")[0]);
        container.innerHTML = `
          <div class="dropdown relative inline-block text-left">
            <button class="btn btn-mv-secondary py-1.5 px-3 rounded-lg text-sm flex items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="userMenuBtn">
              <i class="bi bi-person-circle text-[#e50914] text-base"></i>
              <span class="font-medium text-white">${firstName}</span>
              <i class="bi bi-chevron-down text-xs text-white/50"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-2xl bg-[#171717] border border-white/10 rounded-xl p-1.5 mt-2 min-w-[200px]">
              <li class="px-3 py-2 border-b border-white/10 mb-1">
                <p class="text-xs text-white/50 mb-0 font-medium">Signed in as</p>
                <p class="text-sm text-white font-semibold truncate mb-0">${escapeHtml(user.email)}</p>
              </li>
              <li>
                <a class="dropdown-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors" href="favourites.html">
                  <i class="bi bi-heart-fill text-[#e50914]"></i> My Favourites
                </a>
              </li>
              <li>
                <a class="dropdown-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors" href="about.html">
                  <i class="bi bi-info-circle text-white/70"></i> About MovieVerse
                </a>
              </li>
              <li>
                <a class="dropdown-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-white/10 transition-colors" href="architecture.html">
                  <i class="bi bi-cpu"></i> Java Architecture
                </a>
              </li>
              <li class="border-t border-white/10 mt-1 pt-1">
                <button class="dropdown-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#e50914] hover:bg-[#e50914]/10 transition-colors w-full text-left font-medium" onclick="Auth.logout()">
                  <i class="bi bi-box-arrow-right"></i> Logout
                </button>
              </li>
            </ul>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="login.html" class="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">Sign In</a>
            <a href="register.html" class="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#e50914] hover:bg-[#ff2633] transition-all shadow-lg shadow-[#e50914]/20">Register</a>
          </div>
        `;
      }
    });
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
      const headers = {};
      if (user.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }
      const res = await fetch(`/api/favourites/${user.id}`, { headers });
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
      Toast.show("Please sign in to add movies to your favourites!", "warning");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);
      return;
    }

    const id = Number(movieId);
    const currentlyFav = this.isFav(id);

    try {
      const headers = { "Content-Type": "application/json" };
      if (user.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }

      if (currentlyFav) {
        const res = await fetch(`/api/favourites/${user.id}/${id}`, {
          method: "DELETE",
          headers
        });
        if (res.ok) {
          this.favMovieIds.delete(id);
          this.updateUi(id, false);
          Toast.show("Removed from favourites", "info");
        } else {
          Toast.show("Failed to remove favourite", "danger");
        }
      } else {
        const res = await fetch(`/api/favourites`, {
          method: "POST",
          headers,
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
        btn.innerHTML = `<i class="bi bi-heart text-white/90"></i>`;
        btn.setAttribute("title", "Add to Favourites");
      }
    });

    const detailBtn = document.getElementById(`detailsFavBtn`);
    if (detailBtn && detailBtn.dataset.movieId == movieId) {
      if (isFav) {
        detailBtn.className = "btn btn-danger btn-lg px-4 fw-bold flex items-center justify-center gap-2";
        detailBtn.innerHTML = `<i class="bi bi-heart-fill"></i> In Favourites`;
      } else {
        detailBtn.className = "btn btn-mv-primary btn-lg px-4 fw-bold flex items-center justify-center gap-2";
        detailBtn.innerHTML = `<i class="bi bi-heart"></i> Add to Favourite`;
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
      success: "bi-check-circle-fill text-emerald-400",
      warning: "bi-exclamation-triangle-fill text-amber-400",
      danger: "bi-x-circle-fill text-[#e50914]",
      info: "bi-info-circle-fill text-sky-400"
    };

    const toastEl = document.createElement("div");
    toastEl.className = "toast-mv p-3 flex items-center justify-between gap-3 animate-fade-in";
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");
    
    toastEl.innerHTML = `
      <div class="flex items-center gap-2.5">
        <i class="bi ${icons[type] || icons.info} text-lg"></i>
        <span class="text-sm font-medium text-white">${escapeHtml(message)}</span>
      </div>
      <button type="button" class="text-white/40 hover:text-white transition-colors p-1" aria-label="Close">
        <i class="bi bi-x-lg text-xs"></i>
      </button>
    `;

    container.appendChild(toastEl);

    // Auto remove after 3.5s
    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(10px)';
      toastEl.style.transition = 'all 0.3s ease';
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);

    toastEl.querySelector("button").addEventListener("click", () => {
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

// Generate Standard Movie Card HTML (Tailwind CSS Card)
function createMovieCardHtml(movie) {
  const isFav = Favourites.isFav(movie.id);
  const releaseYear = movie.releaseDate && movie.releaseDate.length >= 4 
    ? movie.releaseDate.substring(0, 4) 
    : (movie.year || "----");
  const primaryGenre = movie.genre ? movie.genre.split(",")[0].trim() : "Movie";
  const posterSrc = getValidPosterUrl(movie.posterUrl);
  const ratingText = typeof movie.rating === 'number' ? movie.rating.toFixed(1) : (movie.rating || 'N/A');

  return `
    <div class="mv-movie-card group" id="movie-card-${movie.id}">
      <div class="mv-poster-box">
        <img src="${escapeHtml(posterSrc)}" 
             alt="${escapeHtml(movie.title)} poster" 
             class="mv-poster-img" 
             loading="lazy" 
             onerror="this.onerror=null; this.src=POSTER_FALLBACK_SVG;">
        
        <!-- Subtle gradient overlay on hover -->
        <div class="mv-poster-overlay"></div>

        <!-- Rating Badge -->
        <div class="absolute top-2.5 left-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-bold text-amber-400 border border-white/10 flex items-center gap-1 shadow-lg z-10">
          <i class="bi bi-star-fill text-xs text-amber-400"></i>
          <span>${ratingText}</span>
        </div>

        <!-- Favourite Heart Button -->
        <button class="card-fav-btn fav-btn-${movie.id} ${isFav ? 'is-fav' : ''}" 
                onclick="Favourites.toggle(${movie.id}, event)" 
                title="${isFav ? 'Remove from Favourites' : 'Add to Favourites'}"
                aria-label="Toggle Favourite">
          <i class="bi ${isFav ? 'bi-heart-fill' : 'bi-heart'} text-sm"></i>
        </button>
      </div>

      <div class="p-3.5 flex flex-col flex-grow justify-between bg-[#171717]">
        <div>
          <a href="movie-details.html?id=${movie.id}" class="text-white font-semibold text-sm line-clamp-1 hover:text-[#e50914] transition-colors leading-snug" title="${escapeHtml(movie.title)}">
            ${escapeHtml(movie.title)}
          </a>
          <div class="flex items-center justify-between text-xs text-white/50 mt-1.5 mb-3">
            <span class="flex items-center gap-1 font-medium"><i class="bi bi-calendar-event text-[11px]"></i>${releaseYear}</span>
            <span class="bg-white/10 px-2 py-0.5 rounded-full text-[11px] text-white/70 font-medium">${escapeHtml(primaryGenre)}</span>
          </div>
        </div>

        <a href="movie-details.html?id=${movie.id}" class="btn-mv-primary py-2 px-3 text-xs w-full flex items-center justify-center gap-1.5 rounded-lg shadow-sm">
          <i class="bi bi-play-circle text-sm"></i> View Details
        </a>
      </div>
    </div>
  `;
}

// Generate Skeleton Cards for Loading state
function createSkeletonCardsHtml(count = 5) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="mv-movie-card">
        <div class="mv-poster-box skeleton-box"></div>
        <div class="p-3.5 bg-[#171717]">
          <div class="h-4 skeleton-box rounded mb-2 w-3/4"></div>
          <div class="flex justify-between items-center mb-3">
            <div class="h-3 skeleton-box rounded w-1/4"></div>
            <div class="h-3 skeleton-box rounded w-1/3"></div>
          </div>
          <div class="h-8 skeleton-box rounded w-full"></div>
        </div>
      </div>
    `;
  }
  return html;
}

// Global Nav Search handler
function setupNavSearch() {
  const forms = document.querySelectorAll("#navSearchForm, #mobileNavSearchForm");
  forms.forEach(form => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      if (input) {
        const q = input.value.trim();
        if (q) {
          window.location.href = `movies.html?search=${encodeURIComponent(q)}`;
        }
      }
    });
  });
}

// Highlight active nav item
function setActiveNavLink() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".nav-link-custom");
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
