// HobbyNest - Socials: a shared feed of posts with photos, likes and comments.
// The page's buttons call createPost(), previewSelectedImage() and
// removeSelectedImage(), so those three are global.

(function () {
    "use strict";

    const PAGE_SIZE = 15;
    const esc = HN.escapeHTML;
    const $ = id => document.getElementById(id);

    let me = null;              // { id, interests: [] }
    let posts = [];             // loaded posts, newest first
    let people = {};            // id -> { full_name, profile_image, headline }
    let likes = {};             // postId -> Set(userId)
    let comments = {};          // postId -> [comment]
    let openComments = new Set();
    let filter = "all";
    let reachedEnd = false;
    let loading = false;

    /* ---------------- helpers ---------------- */

    function timeAgo(value) {
        const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.round(hours / 24);
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days} days ago`;
        return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }

    function person(id) {
        return people[id] || { full_name: "HobbyNest member" };
    }

    function avatar(id) {
        const p = person(id);
        return p.profile_image || HN.initialsAvatar(p.full_name);
    }

    async function loadPeople(ids) {
        const missing = [...new Set(ids)].filter(id => id && !people[id]);
        if (!missing.length) return;
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id, full_name, profile_image, headline")
            .in("id", missing);
        if (error) console.error("People:", error);
        (data || []).forEach(p => { people[p.id] = p; });
    }

    // Storage path of one of our post photos, e.g. "<user id>/123.png"
    function storagePath(url) {
        const marker = "/storage/v1/object/public/social-posts/";
        const i = (url || "").indexOf(marker);
        return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
    }

    /* ---------------- rendering ---------------- */

    function commentHTML(post, c) {
        const canDelete = c.user_id === me.id || post.user_id === me.id;
        return `
            <div class="comment" data-comment="${c.id}">
                <strong>${esc(person(c.user_id).full_name)}:</strong>
                <span>${esc(c.comment)}</span>
                ${canDelete ? `<button class="comment-delete" type="button" data-delete-comment="${c.id}" data-post="${post.id}" aria-label="Delete comment">✕</button>` : ""}
            </div>`;
    }

    function postHTML(post) {
        const author = person(post.user_id);
        const liked = (likes[post.id] || new Set()).has(me.id);
        const likeCount = (likes[post.id] || new Set()).size;
        const list = comments[post.id] || [];
        const open = openComments.has(post.id);

        return `
            <article class="post ${post.image_url ? "" : "post-text-only"}" id="post-${post.id}" data-post="${post.id}">
                <div class="post-header">
                    <img class="post-avatar" src="${esc(avatar(post.user_id))}" alt="">
                    <div class="post-user">
                        <strong>${esc(author.full_name || "HobbyNest member")}</strong>
                        ${author.headline ? `<small>${esc(author.headline)}</small>` : ""}
                        <span class="post-time">${esc(timeAgo(post.created_at))}</span>
                    </div>
                    ${post.user_id === me.id ? `<button class="post-menu" type="button" data-delete-post="${post.id}">Delete</button>` : ""}
                </div>
                ${post.interest ? `<span class="interest-tag">${esc(post.interest)}</span>` : ""}
                ${post.image_url ? `<img class="post-image" src="${esc(post.image_url)}" alt="" loading="lazy">` : ""}
                ${post.caption ? `<p class="post-caption" style="white-space:pre-line">${esc(post.caption)}</p>` : ""}
                <div class="post-actions">
                    <button class="post-action ${liked ? "liked" : ""}" type="button" data-like="${post.id}" aria-pressed="${liked}">
                        ${liked ? "♥" : "♡"} <span>${likeCount}</span>
                    </button>
                    <button class="post-action" type="button" data-toggle-comments="${post.id}">💬 ${list.length}</button>
                    <button class="post-action" type="button" data-share="${post.id}">↗ Share</button>
                </div>
                <div class="comments" style="display:${open ? "block" : "none"}">
                    ${list.map(c => commentHTML(post, c)).join("") || `<p class="muted">No comments yet.</p>`}
                    <form class="comment-form" data-comment-form="${post.id}">
                        <input maxlength="500" placeholder="Write a comment…" aria-label="Write a comment">
                        <button class="btn small" type="submit">Send</button>
                    </form>
                </div>
            </article>`;
    }

    function renderFeed() {
        const feed = $("feed");
        if (!posts.length) {
            feed.innerHTML = `
                <div class="post" style="text-align:center">
                    <h3 style="margin-bottom:8px">${filter === "all" ? "No posts yet" : "No posts here yet"}</h3>
                    <p class="muted">${filter === "all"
                        ? "Be the first to share what you're learning or creating!"
                        : filter === "mine" && !(me.interests || []).length
                            ? "Add interests on your Profile page to see posts that match them."
                            : "Try another topic, or share the first post about it."}</p>
                </div>`;
        } else {
            feed.innerHTML = posts.map(postHTML).join("");
        }
        $("loadMore").style.display = reachedEnd || !posts.length ? "none" : "inline-flex";
    }

    function rerenderPost(postId) {
        const post = posts.find(p => p.id === postId);
        const el = $(`post-${postId}`);
        if (!post || !el) return;
        const typed = el.querySelector(".comment-form input")?.value || "";
        el.outerHTML = postHTML(post);
        if (typed) $(`post-${postId}`).querySelector(".comment-form input").value = typed;
    }

    /* ---------------- loading ---------------- */

    async function loadPosts({ more = false } = {}) {
        if (loading) return;
        loading = true;
        $("loadMore").disabled = true;

        let query = supabaseClient
            .from("social_posts")
            .select("id, user_id, caption, image_url, interest, created_at")
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE);

        if (more && posts.length) query = query.lt("created_at", posts[posts.length - 1].created_at);
        if (filter === "mine") query = query.in("interest", (me.interests || []).length ? me.interests : ["__none__"]);
        else if (filter !== "all") query = query.eq("interest", filter);

        const { data, error } = await query;
        loading = false;
        $("loadMore").disabled = false;

        if (error) {
            console.error("Feed error:", error);
            $("feed").innerHTML = `<p class="muted">Couldn't load posts. Please refresh the page.</p>`;
            return;
        }

        reachedEnd = data.length < PAGE_SIZE;
        posts = more ? posts.concat(data) : data;
        await loadExtras(data.map(p => p.id));
        await loadPeople(posts.map(p => p.user_id).concat(
            Object.values(comments).flat().map(c => c.user_id)));
        renderFeed();
    }

    async function loadExtras(postIds) {
        if (!postIds.length) return;
        const [l, c] = await Promise.all([
            supabaseClient.from("post_likes").select("post_id, user_id").in("post_id", postIds),
            supabaseClient.from("post_comments").select("id, post_id, user_id, comment, created_at")
                .in("post_id", postIds).order("created_at", { ascending: true })
        ]);
        if (l.error) console.error("Likes:", l.error);
        if (c.error) console.error("Comments:", c.error);
        postIds.forEach(id => { likes[id] = new Set(); comments[id] = []; });
        (l.data || []).forEach(r => likes[r.post_id].add(r.user_id));
        (c.data || []).forEach(r => comments[r.post_id].push(r));
    }

    /* ---------------- creating ---------------- */

    function previewSelectedImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            $("previewImage").src = e.target.result;
            $("imagePreview").style.display = "block";
        };
        reader.readAsDataURL(file);
    }

    function removeSelectedImage() {
        $("postImage").value = "";
        $("previewImage").removeAttribute("src");
        $("imagePreview").style.display = "none";
    }

    async function createPost() {
        const caption = $("postCaption").value.trim();
        const file = $("postImage").files[0];
        if (!caption && !file) return toast("Add a photo or write something before posting!");
        if (caption.length > 2000) return toast("Posts can be up to 2000 characters.");

        const button = document.querySelector(".post-btn");
        button.disabled = true;
        button.textContent = file ? "Uploading…" : "Posting…";

        try {
            const imageUrl = file ? await HN.uploadImage("social-posts", file) : null;
            const { data, error } = await supabaseClient
                .from("social_posts")
                .insert({ user_id: me.id, caption: caption || null, image_url: imageUrl, interest: $("postInterest").value || null })
                .select("id, user_id, caption, image_url, interest, created_at")
                .single();
            if (error) throw error;

            likes[data.id] = new Set();
            comments[data.id] = [];
            if (filter === "all" || filter === data.interest) posts.unshift(data);
            $("postCaption").value = "";
            $("postInterest").value = "";
            removeSelectedImage();
            renderFeed();
            toast("Posted ✓");
        } catch (error) {
            console.error("Post error:", error);
            toast(error.message && !error.code ? error.message : "Couldn't post. Please try again.");
        } finally {
            button.disabled = false;
            button.textContent = "Post";
        }
    }

    /* ---------------- interactions ---------------- */

    async function toggleLike(postId) {
        const set = likes[postId] || (likes[postId] = new Set());
        const wasLiked = set.has(me.id);
        if (wasLiked) set.delete(me.id); else set.add(me.id);
        rerenderPost(postId);

        const { error } = wasLiked
            ? await supabaseClient.from("post_likes").delete().eq("post_id", postId).eq("user_id", me.id)
            : await supabaseClient.from("post_likes").insert({ post_id: postId, user_id: me.id });

        if (error && error.code !== "23505") {
            console.error("Like error:", error);
            if (wasLiked) set.add(me.id); else set.delete(me.id);
            rerenderPost(postId);
            toast("Couldn't update the like.");
        }
    }

    async function addComment(postId, input) {
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        const { data, error } = await supabaseClient
            .from("post_comments")
            .insert({ post_id: postId, user_id: me.id, comment: text })
            .select("id, post_id, user_id, comment, created_at")
            .single();
        input.disabled = false;
        if (error) {
            console.error("Comment error:", error);
            return toast("Couldn't add your comment.");
        }
        (comments[postId] ||= []).push(data);
        input.value = "";
        openComments.add(postId);
        rerenderPost(postId);
        $(`post-${postId}`).querySelector(".comment-form input")?.focus();
    }

    async function deleteComment(postId, commentId) {
        const { error } = await supabaseClient.from("post_comments").delete().eq("id", commentId);
        if (error) {
            console.error("Delete comment error:", error);
            return toast("Couldn't delete the comment.");
        }
        comments[postId] = (comments[postId] || []).filter(c => c.id !== commentId);
        rerenderPost(postId);
    }

    async function deletePost(postId) {
        const post = posts.find(p => p.id === postId);
        if (!post || !confirm("Delete this post? Its likes and comments go too.")) return;
        const { error } = await supabaseClient.from("social_posts").delete().eq("id", postId);
        if (error) {
            console.error("Delete post error:", error);
            return toast("Couldn't delete the post.");
        }
        const path = storagePath(post.image_url);
        if (path) supabaseClient.storage.from("social-posts").remove([path]).catch(() => {});
        posts = posts.filter(p => p.id !== postId);
        renderFeed();
        toast("Post deleted");
    }

    async function sharePost(postId) {
        const url = `${location.origin}${location.pathname}#post-${postId}`;
        try {
            await navigator.clipboard.writeText(url);
            toast("Link copied — share it with someone on HobbyNest");
        } catch (error) {
            prompt("Copy this link:", url);
        }
    }

    document.addEventListener("click", event => {
        const t = event.target;
        const like = t.closest("[data-like]");
        if (like) return toggleLike(Number(like.dataset.like));
        const toggle = t.closest("[data-toggle-comments]");
        if (toggle) {
            const id = Number(toggle.dataset.toggleComments);
            if (openComments.has(id)) openComments.delete(id); else openComments.add(id);
            return rerenderPost(id);
        }
        const share = t.closest("[data-share]");
        if (share) return sharePost(Number(share.dataset.share));
        const delPost = t.closest("[data-delete-post]");
        if (delPost) return deletePost(Number(delPost.dataset.deletePost));
        const delComment = t.closest("[data-delete-comment]");
        if (delComment) return deleteComment(Number(delComment.dataset.post), Number(delComment.dataset.deleteComment));
        const chip = t.closest("[data-feed]");
        if (chip) {
            document.querySelectorAll("[data-feed]").forEach(c => c.classList.toggle("active", c === chip));
            filter = chip.dataset.feed;
            reachedEnd = false;
            $("feed").innerHTML = `<p class="muted">Loading posts…</p>`;
            return loadPosts();
        }
    });

    document.addEventListener("submit", event => {
        const form = event.target.closest("[data-comment-form]");
        if (!form) return;
        event.preventDefault();
        addComment(Number(form.dataset.commentForm), form.querySelector("input"));
    });

    $("loadMore").addEventListener("click", () => loadPosts({ more: true }));

    /* ---------------- start ---------------- */

    async function start() {
        const { user } = await window.nsReady;
        const { data } = await supabaseClient.from("profiles")
            .select("id, full_name, profile_image, headline, interests").eq("id", user.id).single();
        me = { id: user.id, interests: (data && data.interests) || [] };
        if (data) people[user.id] = data;

        await loadPosts();

        // Opened from a shared link (#post-123)? Scroll to it.
        const target = location.hash.match(/^#post-(\d+)$/);
        if (target && $(`post-${target[1]}`)) {
            const el = $(`post-${target[1]}`);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("highlight");
        }
    }

    window.createPost = createPost;
    window.previewSelectedImage = previewSelectedImage;
    window.removeSelectedImage = removeSelectedImage;

    start().catch(error => {
        console.error("Socials error:", error);
        $("feed").innerHTML = `<p class="muted">Something went wrong. Please refresh the page.</p>`;
    });
})();
