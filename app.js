(function () {
  "use strict";

  const grid = document.getElementById("grid");
  const emptyEl = document.getElementById("empty");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const filterTabs = document.getElementById("filterTabs");
  const sortSelect = document.getElementById("sortSelect");
  const journalSelect = document.getElementById("journalSelect");
  const searchInput = document.getElementById("searchInput");
  const toast = document.getElementById("toast");

  const PAGE_SIZE = 40;
  let all = [];
  let state = { filter: "all", sort: "recent", search: "", journal: "", offset: 0, done: false };
  let searchTimer = null;

  const LIKES_KEY = "gallery_likes_v1";
  function myLikes() {
    try { return JSON.parse(localStorage.getItem(LIKES_KEY) || "[]"); } catch { return []; }
  }
  function isLiked(id) { return myLikes().includes(id); }
  function toggleMyLike(id) {
    const likes = myLikes();
    const i = likes.indexOf(id);
    if (i >= 0) likes.splice(i, 1); else likes.push(id);
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
    return i < 0;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast("已复制：" + text), () => showToast("复制失败"));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("已复制：" + text); } catch { showToast("复制失败"); }
      document.body.removeChild(ta);
    }
  }

  function journalGroup(fig) {
    return fig.source === "biorxiv" ? "bioRxiv" : fig.journal;
  }

  function filtered() {
    let list = all.slice();
    if (state.filter === "liked") {
      const likes = myLikes();
      list = list.filter((f) => likes.includes(f.id));
    } else if (state.filter === "top") {
      list = list.filter((f) => f.like_count > 0).sort((a, b) => b.like_count - a.like_count || b.id - a.id).slice(0, 20);
    }
    if (state.journal) list = list.filter((f) => journalGroup(f) === state.journal);
    if (state.search.trim()) {
      const kw = state.search.trim().toLowerCase();
      list = list.filter((f) =>
        [f.article_title, f.caption_title, f.caption, f.fig_label, f.article_doi]
          .join(" ")
          .toLowerCase()
          .includes(kw)
      );
    }
    if (state.filter !== "top") {
      if (state.sort === "pubdate") {
        list.sort((a, b) => (b.pub_date || "").localeCompare(a.pub_date || "") || b.id - a.id);
      } else {
        list.sort((a, b) => b.id - a.id);
      }
    }
    return list;
  }

  function cardEl(fig) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="palette-strip">${(fig.palette || [])
        .map((c) => `<span style="background:${esc(c.hex)}" title="${esc(c.hex)}"></span>`)
        .join("")}</div>
      <img class="card-img" loading="lazy" src="${esc(fig.thumb)}" alt="${esc(fig.caption_title || "")}" />
      <div class="card-body">
        <div class="card-caption">${esc(fig.caption_title || fig.fig_label || "未命名插图")}</div>
        <div class="card-article">${esc(fig.article_title || "")}</div>
      </div>
      <div class="card-meta">
        <span class="card-source" title="${esc(fig.journal)}">${esc(fig.journal)}</span>
        <span class="card-date">${esc((fig.pub_date || "").slice(0, 10))}</span>
        <div class="card-actions">
          <button class="icon-btn ${isLiked(fig.id) ? "liked" : ""}" data-act="like" title="喜欢（保存在本浏览器）">♥<span class="like-count">${fig.like_count || ""}</span></button>
        </div>
      </div>
    `;
    card.addEventListener("click", (e) => {
      const btn = e.target.closest(".icon-btn");
      if (btn) {
        e.stopPropagation();
        const liked = toggleMyLike(fig.id);
        btn.classList.toggle("liked", liked);
        showToast(liked ? "已加入喜欢（本浏览器）" : "已取消喜欢");
        return;
      }
      if (e.target.closest("a")) return;
      openModal(fig);
    });
    return card;
  }

  function renderFigures(reset) {
    if (reset) {
      state.offset = 0;
      state.done = false;
      grid.innerHTML = "";
    }
    const list = filtered();
    const page = list.slice(state.offset, state.offset + PAGE_SIZE);
    const frag = document.createDocumentFragment();
    page.forEach((f) => frag.appendChild(cardEl(f)));
    grid.appendChild(frag);
    state.offset += page.length;
    state.done = state.offset >= list.length;
    emptyEl.hidden = !(state.done && state.offset === 0);
    loadMoreBtn.hidden = state.done;
    if (state.filter === "top") {
      emptyEl.hidden = !(list.length === 0) && grid.children.length > 0 ? true : emptyEl.hidden;
    }
  }

  // —— 详情弹层 ——
  function closeModal() {
    document.querySelector(".modal-mask")?.remove();
  }

  function openModal(fig) {
    closeModal();
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="modal">
        <button class="modal-close" title="关闭">✕</button>
        <div class="detail-topbar" style="padding:0 0 8px">
          <span class="next-run">${esc(fig.article_doi || "")}</span>
          <div class="detail-actions" style="margin-left:auto;width:200px">
            <button class="action-btn ${isLiked(fig.id) ? "liked" : ""}" id="modalLike">${isLiked(fig.id) ? "♥ 已喜欢" : "♡ 喜欢"}${fig.like_count ? " · " + fig.like_count : ""}</button>
          </div>
        </div>
        <div class="detail-layout">
          <div class="detail-main">
            <section class="detail-card detail-image">
              <h2>插图预览</h2>
              <img src="${esc(fig.image)}" alt="${esc(fig.caption_title || "")}" />
            </section>
            <section class="detail-card">
              <h2>配色方案</h2>
              <div class="palette-list" id="modalPalette"></div>
            </section>
            <section class="detail-card">
              <h2>交互式重新提取</h2>
              <p class="embed-note">内嵌「科研配图配色方案提取器」，可调整颜色数量与过滤选项，点击色块复制。</p>
              <iframe class="extractor-embed" title="配色提取器" loading="lazy"
                src="extractor/index.html?src=${encodeURIComponent("../" + fig.image)}"></iframe>
            </section>
          </div>
          <aside class="detail-side">
            <section class="detail-card">
              <h2>文章信息</h2>
              <div class="meta-row"><span class="label">文章标题</span><span>${esc(fig.article_title || "-")}</span></div>
              <div class="meta-row"><span class="label">作者</span><span>${esc((fig.authors || []).slice(0, 8).join(", ") || "-")}</span></div>
              <div class="meta-row"><span class="label">期刊</span><span>${esc(fig.journal || "-")}</span></div>
              <div class="meta-row"><span class="label">发表日期</span><span>${esc(fig.pub_date || "-")}</span></div>
              <div class="meta-row"><span class="label">图号</span><span>${esc(fig.fig_label || "-")}</span></div>
              <div class="meta-row"><span class="label">原文链接</span><span><a href="${articleLink(fig)}" target="_blank" rel="noopener">${esc(articleLinkLabel(fig))}</a></span></div>
            </section>
            <section class="detail-card">
              <h2>题注</h2>
              <div class="detail-caption">${esc((fig.fig_label ? fig.fig_label + "：" : "") + (fig.caption || fig.caption_title || "（无题注）"))}</div>
            </section>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.addEventListener("click", (e) => {
      if (e.target === mask) closeModal();
    });
    mask.querySelector(".modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
    });

    // 配色列表
    const list = mask.querySelector("#modalPalette");
    (fig.palette || []).forEach((c) => {
      const item = document.createElement("div");
      item.className = "color-item";
      const rgbStr = `rgb(${c.r}, ${c.g}, ${c.b})`;
      item.innerHTML = `
        <div class="color-swatch" style="background:${esc(c.hex)}"></div>
        <div class="color-value">${esc(c.hex)}</div>
        <div class="color-value">${esc(rgbStr)}</div>
      `;
      item.addEventListener("click", () => copyText(c.hex));
      list.appendChild(item);
    });
    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.className = "btn-primary";
    copyAll.style.marginTop = "12px";
    copyAll.textContent = "复制全部配色";
    copyAll.addEventListener("click", () =>
      copyText((fig.palette || []).map((c) => `${c.hex}  rgb(${c.r}, ${c.g}, ${c.b})`).join("\n"))
    );
    list.parentElement.appendChild(copyAll);

    // 喜欢（localStorage）
    mask.querySelector("#modalLike").addEventListener("click", (e) => {
      const liked = toggleMyLike(fig.id);
      e.currentTarget.className = "action-btn" + (liked ? " liked" : "");
      e.currentTarget.textContent = (liked ? "♥ 已喜欢" : "♡ 喜欢") + (fig.like_count ? " · " + fig.like_count : "");
      showToast(liked ? "已加入喜欢（本浏览器）" : "已取消喜欢");
    });
  }

  function articleLink(fig) {
    const doi = fig.article_doi || "";
    if (doi.startsWith("PMC:")) return `https://pmc.ncbi.nlm.nih.gov/articles/${doi.slice(4)}/`;
    return `https://doi.org/${doi}`;
  }
  function articleLinkLabel(fig) {
    const doi = fig.article_doi || "";
    return doi.startsWith("PMC:") ? doi.slice(4) : `doi.org/${doi}`;
  }

  // —— 事件 ——
  filterTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    filterTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.filter = tab.dataset.filter;
    renderFigures(true);
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderFigures(true);
  });

  journalSelect.addEventListener("change", () => {
    state.journal = journalSelect.value;
    renderFigures(true);
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value;
      renderFigures(true);
    }, 250);
  });

  loadMoreBtn.addEventListener("click", () => renderFigures(false));

  // —— 初始化 ——
  fetch("data/gallery.json")
    .then((r) => r.json())
    .then((data) => {
      all = data;
      document.getElementById("statTotal").textContent = all.length;
      const groups = [...new Set(all.map(journalGroup))];
      document.getElementById("statJournals").textContent = groups.length;
      journalSelect.innerHTML =
        '<option value="">全部期刊</option>' +
        groups
          .map((g) => {
            const n = all.filter((f) => journalGroup(f) === g).length;
            return `<option value="${esc(g)}">${esc(g)}（${n}）</option>`;
          })
          .join("");
      renderFigures(true);
    })
    .catch(() => {
      emptyEl.hidden = false;
      emptyEl.textContent = "数据加载失败（请通过静态服务器访问，勿直接双击打开）";
    });
})();
