// Application State
let projects = [];
let activeFilter = "All";
let searchQuery = "";

// DOM Elements
const projectsGrid = document.getElementById("projects-grid");
const searchInput = document.getElementById("search-input");
const filterTabsContainer = document.getElementById("filter-tabs");
const projectDetailModal = document.getElementById("project-detail-modal");
const toast = document.getElementById("toast");

const LANGUAGE_COLORS = {
  "JavaScript": "#f1e05a",
  "HTML": "#e34c26",
  "CSS": "#563d7c",
  "Python": "#3572A5",
  "TypeScript": "#3178c6",
  "C++": "#f34b7d",
  "C": "#555555",
  "Go": "#00ADD8",
  "Rust": "#dea584",
  "Shell": "#89e051",
  "Ruby": "#701516",
  "PHP": "#4F5D95",
  "Java": "#b07219"
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  // Clear old cache once to force fetching of all language percentages (including NSIS 0.3%)
  if (!localStorage.getItem("portfolio_cache_v3")) {
    localStorage.removeItem("my_portfolio_projects");
    localStorage.setItem("portfolio_cache_v3", "true");
  }
  initProjects();
  initActiveNavLink();
  setupProfileDropdownListener();
  setupMobileMenuListener();
  setupScrollListener();
  initSkullAnimation();
  setupDragListener();
  
  // Initialize Projects Grid if on Projects Page (or homepage preview)
  if (projectsGrid) {
    renderFilters();
    renderProjects();
    setupProjectsPageListeners();
  }
  


  // Fetch updated repositories from GitHub in the background
  fetchGitHubProjects().then(() => {
    if (projectsGrid) {
      renderFilters();
      renderProjects();
    }
  });
});

// Seed data from projects-data.js or cache if local storage is empty
function initProjects() {
  const savedProjects = localStorage.getItem("my_portfolio_projects");
  if (savedProjects) {
    projects = JSON.parse(savedProjects);
    projects.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  } else if (typeof INITIAL_PROJECTS !== "undefined") {
    projects = [...INITIAL_PROJECTS];
  } else {
    projects = [];
  }
}

async function fetchGitHubProjects() {
  try {
    const response = await fetch("https://api.github.com/users/xenpian/repos?sort=updated");
    if (!response.ok) throw new Error("GitHub API error");
    const repos = await response.json();
    
    // Read the current cache from localStorage if it exists
    let cachedProjects = [];
    const saved = localStorage.getItem("my_portfolio_projects");
    if (saved) {
      try {
        cachedProjects = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse cached projects", e);
      }
    }
    const cachedMap = new Map(cachedProjects.map(p => [p.title, p]));

    // Map GitHub repos to our project structure
    const mappedProjects = repos.map(repo => {
      const cached = cachedMap.get(repo.name);
      // Reuse cached languages if updatedAt timestamp hasn't changed
      const hasValidLanguages = cached && cached.languages && cached.updatedAt === repo.updated_at;
      return {
        id: String(repo.id),
        title: repo.name,
        shortDescription: repo.description || "No description provided.",
        longDescription: repo.description || "No description provided.",
        language: repo.language || "",
        languageColor: LANGUAGE_COLORS[repo.language] || "#8b949e",
        tags: repo.topics && repo.topics.length > 0 ? repo.topics : (repo.language ? [repo.language] : []),
        githubUrl: repo.html_url,
        liveUrl: repo.homepage || "",
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        features: [
          `Stars: ${repo.stargazers_count}`,
          `Watchers: ${repo.watchers_count}`,
          `Forks: ${repo.forks_count}`,
          `Last updated: ${new Date(repo.updated_at).toLocaleDateString('en-US')}`
        ],
        languages: hasValidLanguages ? cached.languages : null
      };
    });

    // Fetch languages in parallel for repos that don't have them cached
    await Promise.all(mappedProjects.map(async (project) => {
      if (project.languages) return;
      try {
        const langResponse = await fetch(`https://api.github.com/repos/xenpian/${project.title}/languages`);
        if (langResponse.ok) {
          const langData = await langResponse.json();
          const total = Object.values(langData).reduce((sum, val) => sum + val, 0);
          if (total > 0) {
            const langs = Object.entries(langData)
              .map(([lang, bytes]) => {
                const percent = ((bytes / total) * 100).toFixed(1);
                return { lang, percent: parseFloat(percent) };
              })
              .sort((a, b) => b.percent - a.percent);
            
            // Show languages with at least 0.1% usage (i.e. percent > 0 after rounding), always keeping at least the main one
            const filteredLangs = langs.filter(l => l.percent > 0);
            project.languages = filteredLangs.length > 0 ? filteredLangs : langs.slice(0, 1);
          } else {
            project.languages = [];
          }
        } else {
          project.languages = [];
        }
      } catch (err) {
        console.error(`Failed to fetch languages for ${project.title}:`, err);
        project.languages = [];
      }
    }));

    projects = mappedProjects.sort((a, b) => b.stars - a.stars);
    saveProjectsToStorage();
  } catch (error) {
    console.error("Failed to fetch GitHub repos, using cache:", error);
  }
}

function saveProjectsToStorage() {
  localStorage.setItem("my_portfolio_projects", JSON.stringify(projects));
}

// Highlight the current page in navigation header
function initActiveNavLink() {
  const path = window.location.pathname;
  const page = path.substring(path.lastIndexOf("/") + 1);
  
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.remove("active");
    const href = link.getAttribute("href");
    if (
      page === href || 
      (href === "./" && (page === "" || page === "index.php" || page === "index.html"))
    ) {
      link.classList.add("active");
    }
  });
}

// Profile Dropdown Toggle Logic
function setupProfileDropdownListener() {
  const profileAvatarBtn = document.getElementById("profile-avatar-btn");
  const profileDropdownMenu = document.getElementById("profile-dropdown-menu");
  
  if (profileAvatarBtn && profileDropdownMenu) {
    profileAvatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdownMenu.classList.toggle("active");
    });
    
    document.addEventListener("click", () => {
      profileDropdownMenu.classList.remove("active");
    });
  }
}

// Show active notifications
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

// Projects list & search events setup
function setupProjectsPageListeners() {
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderProjects();
    });
  }
}

// Render dynamic tag filters on projects page
function renderFilters() {
  if (!filterTabsContainer) return;
  
  const allTags = new Set();
  projects.forEach(project => {
    if (project.tags && Array.isArray(project.tags)) {
      project.tags.forEach(tag => allTags.add(tag));
    }
  });
  
  const tagsList = ["All", ...Array.from(allTags)];
  
  filterTabsContainer.innerHTML = "";
  tagsList.forEach(tag => {
    const tab = document.createElement("button");
    tab.className = `tag-btn ${tag === activeFilter ? 'active' : ''}`;
    tab.textContent = tag;
    tab.addEventListener("click", () => {
      activeFilter = tag;
      document.querySelectorAll(".tag-btn").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderProjects();
    });
    filterTabsContainer.appendChild(tab);
  });
}

// Render projects on grid
function renderProjects() {
  if (!projectsGrid) return;
  
  projectsGrid.innerHTML = "";
  
  // Filter logic
  let filtered = projects;
  
  // Check if page limits projects (e.g. index.html should only show top 2 projects)
  const isHomepageLimit = projectsGrid.dataset.limit !== undefined;
  
  if (!isHomepageLimit) {
    filtered = projects.filter(project => {
      const matchesTag = activeFilter === "All" || (project.tags && project.tags.includes(activeFilter));
      const matchesSearch = project.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            project.shortDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (project.language && project.language.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            project.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesTag && matchesSearch;
    });
  } else {
    // Homepage: just display first N projects
    const limit = parseInt(projectsGrid.dataset.limit);
    filtered = projects.slice(0, limit);
  }
  
  if (filtered.length === 0) {
    projectsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 16px; color: var(--text-muted);">
        <p>No projects found matching your search criteria.</p>
      </div>
    `;
    return;
  }
  
  filtered.forEach(project => {
    const card = document.createElement("div");
    card.className = "repo-card";
    
    // Clicking title or body opens details
    card.addEventListener("click", () => {
      openProjectDetail(project.id);
    });
    
    let tagsHTML = "";
    if (project.languages && project.languages.length > 0) {
      tagsHTML = project.languages.map(langObj => {
        const color = LANGUAGE_COLORS[langObj.lang] || "#8b949e";
        let styleStr = `background-color: rgba(139, 148, 158, 0.15); color: ${color}; border: 1px solid rgba(139, 148, 158, 0.3);`;
        if (color.startsWith("#") && color.length === 7) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          styleStr = `background-color: rgba(${r}, ${g}, ${b}, 0.12); color: ${color}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.25);`;
        }
        return `<span class="repo-tag" style="${styleStr}">${langObj.lang} ${langObj.percent}%</span>`;
      }).join("");
    } else {
      tagsHTML = project.tags.map(tag => `<span class="repo-tag">${tag}</span>`).join("");
    }

    const langHTML = project.language ? `
      <div class="repo-lang">
        <span class="lang-dot" style="background-color: ${project.languageColor || '#8b949e'}"></span>
        <span>${project.language}</span>
      </div>
    ` : "";
    
    card.innerHTML = `
      <div>
        <div class="repo-header">
          <div class="repo-title-wrap">
            <span class="repo-icon"><i class="fa-solid fa-bookmark"></i></span>
            <span class="repo-title">${project.title}</span>
          </div>
        </div>
        <p class="repo-desc">${project.shortDescription}</p>
      </div>
      <div class="repo-footer">
        ${langHTML}
        <div class="repo-tags">
          ${tagsHTML}
        </div>
      </div>
    `;
    
    projectsGrid.appendChild(card);
  });
}

// Project Details Modal view
window.openProjectDetail = function(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  
  const detailTitle = document.getElementById("detail-title");
  const detailDesc = document.getElementById("detail-desc");
  const detailFeatures = document.getElementById("detail-features");
  const detailGithub = document.getElementById("detail-github");
  const detailLive = document.getElementById("detail-live");
  const detailLang = document.getElementById("detail-lang");
  
  if (detailTitle) detailTitle.textContent = project.title;
  if (detailDesc) detailDesc.textContent = project.longDescription || project.shortDescription;
  
  if (detailLang && project.language) {
    detailLang.innerHTML = `
      <span class="lang-dot" style="background-color: ${project.languageColor || '#8b949e'}"></span>
      <span style="font-weight:600;">${project.language}</span>
    `;
  } else if (detailLang) {
    detailLang.innerHTML = "";
  }
  
  if (detailFeatures) {
    detailFeatures.innerHTML = "";
    const listItems = project.features && project.features.length > 0 
      ? project.features 
      : ["Clean code structure and performance optimization", "Responsive, modern layout design"];
      
    listItems.forEach(feat => {
      const li = document.createElement("li");
      li.textContent = feat;
      detailFeatures.appendChild(li);
    });
  }
  
  if (detailGithub) {
    if (project.githubUrl) {
      detailGithub.href = project.githubUrl;
      detailGithub.style.display = "inline-flex";
    } else {
      detailGithub.style.display = "none";
    }
  }
  
  if (detailLive) {
    if (project.liveUrl) {
      detailLive.href = project.liveUrl;
      detailLive.style.display = "inline-flex";
    } else {
      detailLive.style.display = "none";
    }
  }
  
  if (projectDetailModal) {
    projectDetailModal.classList.add("active");
  }
};

window.closeDetailModal = function() {
  if (projectDetailModal) {
    projectDetailModal.classList.remove("active");
  }
};

// Modal click outside close
window.addEventListener("click", (e) => {
  if (e.target === projectDetailModal) {
    closeDetailModal();
  }
});

// Responsive Mobile Menu Toggle
function setupMobileMenuListener() {
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const navMenu = document.getElementById("nav-menu");
  
  if (menuToggleBtn && navMenu) {
    menuToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navMenu.classList.toggle("active");
      const icon = menuToggleBtn.querySelector("i");
      if (navMenu.classList.contains("active")) {
        icon.className = "fa-solid fa-xmark";
      } else {
        icon.className = "fa-solid fa-bars";
      }
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!navMenu.contains(e.target) && e.target !== menuToggleBtn) {
        navMenu.classList.remove("active");
        const icon = menuToggleBtn.querySelector("i");
        if (icon) icon.className = "fa-solid fa-bars";
      }
    });
  }
}

// Scrolled state detection for vertical navbar capsule
function setupScrollListener() {
  const header = document.querySelector("header");
  const handleScroll = () => {
    if (window.scrollY > 60) {
      document.body.classList.add("scrolled");
      // Add default snap-right if no snap class exists
      if (header && !header.classList.contains("snap-left") && !header.classList.contains("snap-right") && !header.classList.contains("snap-top") && !header.classList.contains("snap-bottom")) {
        header.classList.add("snap-right");
      }
    } else {
      document.body.classList.remove("scrolled");
    }
  };
  
  window.addEventListener("scroll", handleScroll);
  handleScroll(); // Call immediately on load
}

// initSkullAnimation is now handled natively via hardware-accelerated GIF for 0% CPU usage
function initSkullAnimation() {}

// Pointer events dragging and viewport-snapping for scrolled capsule header
function setupDragListener() {
  const header = document.querySelector("header");
  if (!header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  header.addEventListener("pointerdown", (e) => {
    // Only allow dragging in scrolled capsule state
    if (!document.body.classList.contains("scrolled")) return;
    
    // Do not drag if clicking active components or dropdowns
    if (e.target.closest("a, button, input, img, .profile-dropdown")) return;

    isDragging = true;
    header.setPointerCapture(e.pointerId);
    
    const rect = header.getBoundingClientRect();
    
    startX = e.clientX;
    startY = e.clientY;
    
    // Calculate initial center coordinates
    initialLeft = rect.left + rect.width / 2;
    initialTop = rect.top + rect.height / 2;

    header.style.transition = "none"; // Disable animation during active dragging
    header.style.cursor = "grabbing";
    
    e.preventDefault();
  });

  header.addEventListener("pointermove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newX = initialLeft + dx;
    const newY = initialTop + dy;

    // Center header under mouse
    header.style.left = `${newX}px`;
    header.style.top = `${newY}px`;
    header.style.bottom = "auto";
    header.style.right = "auto";
    header.style.transform = "translate(-50%, -50%)";

    // Dynamic snapping preview in real-time
    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const distLeft = x;
    const distRight = w - x;
    const distTop = y;
    const distBottom = h - y;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    let currentSnap = "";
    if (minDist === distLeft) currentSnap = "snap-left";
    else if (minDist === distRight) currentSnap = "snap-right";
    else if (minDist === distTop) currentSnap = "snap-top";
    else currentSnap = "snap-bottom";

    if (!header.classList.contains(currentSnap)) {
      header.classList.remove("snap-left", "snap-right", "snap-top", "snap-bottom");
      header.classList.add(currentSnap);
    }
  });

  header.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    header.releasePointerCapture(e.pointerId);

    header.style.cursor = "";
    header.style.transition = ""; // Restore animations

    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Distance to viewport edges
    const distLeft = x;
    const distRight = w - x;
    const distTop = y;
    const distBottom = h - y;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    header.classList.remove("snap-left", "snap-right", "snap-top", "snap-bottom");

    // Clear inline positions to let CSS handle layout
    header.style.left = "";
    header.style.top = "";
    header.style.bottom = "";
    header.style.right = "";
    header.style.transform = "";

    // Snap to the closest viewport edge
    if (minDist === distLeft) {
      header.classList.add("snap-left");
    } else if (minDist === distRight) {
      header.classList.add("snap-right");
    } else if (minDist === distTop) {
      header.classList.add("snap-top");
    } else {
      header.classList.add("snap-bottom");
    }
  });

  header.addEventListener("pointercancel", () => {
    if (!isDragging) return;
    isDragging = false;
    header.style.cursor = "";
    header.style.transition = "";
    header.style.left = "";
    header.style.top = "";
    header.style.bottom = "";
    header.style.right = "";
    header.style.transform = "";
  });
}


