content://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Femulated%2F0%2FDownload%2FSkyLink_Firebase_Starter%2FSkyLink%2Fapp.jscontent://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Femulated%2F0%2FDownload%2FSkyLink_Firebase_Starter%2FSkyLink%2Fapp.jscontent://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Femulated%2F0%2FDownload%2FSkyLink_Firebase_Starter%2FSkyLink%2Fapp.jsimport { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged,
  signOut, updateProfile, reload
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const views = ["auth-view", "verify-view", "app-view"];
const authMessage = $("auth-message");
const verifyMessage = $("verify-message");
let auth, db, currentUser = null, stopFeed = null, likedPostIds = new Set();

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") &&
  firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_");

function showView(id) {
  views.forEach(view => $(view).classList.toggle("hidden", view !== id));
}
function say(element, message, good = false) {
  element.textContent = message;
  element.style.color = good ? "#21845f" : "#b13d4d";
}
function cleanError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।",
    "auth/invalid-email": "ইমেইল ঠিকানাটি সঠিক নয়।",
    "auth/weak-password": "আরও শক্ত পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)।",
    "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
    "auth/user-not-found": "এই ইমেইলে অ্যাকাউন্ট পাওয়া যায়নি।",
    "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়।",
    "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন.",
    "permission-denied": "Firebase Firestore Rules পরীক্ষা করুন।",
    "failed-precondition": "Firebase সেটআপ বা index সংক্রান্ত সমস্যা হয়েছে।"
  };
  return map[code] || `সমস্যা হয়েছে: ${error?.message || "আবার চেষ্টা করুন।"}`;
}
function requireConfigured() {
  if (isConfigured) return true;
  say(authMessage, "আগে firebase-config.js ফাইলে Firebase Console-এর Web App config বসান। README-তে ধাপ দেওয়া আছে।");
  return false;
}
function nameFromUser(user) {
  return user.displayName || (user.email || "SkyLink User").split("@")[0];
}
function setUserDetails(user) {
  const name = nameFromUser(user);
  $("profile-name").textContent = name;
  $("profile-email").textContent = user.email || "";
  $("welcome-name").textContent = name;
  $("side-name").textContent = name;
  $("avatar").textContent = name.slice(0, 1).toUpperCase();
  $("composer-avatar").textContent = name.slice(0, 1).toUpperCase();
}
function stopListening() {
  if (stopFeed) { stopFeed(); stopFeed = null; }
}
function showVerification(user) {
  $("verify-copy").textContent = `আমরা ${user.email || "আপনার ইমেইল"} ঠিকানায় verification link পাঠিয়েছি।`;
  showView("verify-view");
}
function mapPostTime(timestamp) {
  if (!timestamp?.toDate) return "এইমাত্র";
  return timestamp.toDate().toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
}

function renderFeed(snapshot) {
  const list = $("feed-list");
  list.replaceChildren();
  if (snapshot.empty) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "এখনো কোনো পোস্ট নেই। প্রথম পোস্টটি আপনিই লিখুন!";
    list.append(empty);
    return;
  }
  snapshot.forEach(postSnap => {
    const post = postSnap.data();
    const id = postSnap.id;
    const card = document.createElement("article");
    card.className = "post-card";
    const head = document.createElement("div"); head.className = "post-head";
    const avatar = document.createElement("div"); avatar.className = "avatar small";
    avatar.textContent = String(post.authorName || "S").slice(0,1).toUpperCase();
    const who = document.createElement("div");
    const author = document.createElement("div"); author.className = "post-author"; author.textContent = post.authorName || "SkyLink User";
    const date = document.createElement("div"); date.className = "post-date"; date.textContent = mapPostTime(post.createdAt);
    who.append(author, date); head.append(avatar, who);
    const body = document.createElement("p"); body.className = "post-text"; body.textContent = post.text || "";
    const actions = document.createElement("div"); actions.className = "post-actions";
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const likeBtn = document.createElement("button"); likeBtn.className = "action-button" + (likes.includes(currentUser.uid) ? " liked" : "");
    likeBtn.textContent = `${likes.includes(currentUser.uid) ? "♥" : "♡"} লাইক (${likes.length})`;
    likeBtn.addEventListener("click", async () => {
      try {
        const postRef = doc(db, "posts", id);
        await updateDoc(postRef, { likes: likes.includes(currentUser.uid) ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) });
      } catch (e) { alert(cleanError(e)); }
    });
    const commentBtn = document.createElement("button"); commentBtn.className = "action-button"; commentBtn.textContent = `💬 মন্তব্য (${Array.isArray(post.comments) ? post.comments.length : 0})`;
    actions.append(likeBtn, commentBtn);
    const comments = document.createElement("div"); comments.className = "comments";
    (Array.isArray(post.comments) ? post.comments : []).slice(-15).forEach(comment => {
      const item = document.createElement("div"); item.className = "comment";
      const strong = document.createElement("strong"); strong.textContent = `${comment.authorName || "User"}:`;
      const text = document.createElement("span"); text.textContent = comment.text || "";
      item.append(strong, text); comments.append(item);
    });
    const commentForm = document.createElement("form"); commentForm.className = "comment-form";
    const input = document.createElement("input"); input.type = "text"; input.maxLength = 500; input.placeholder = "একটি মন্তব্য লিখুন…"; input.required = true; input.setAttribute("aria-label", "মন্তব্য");
    const send = document.createElement("button"); send.type = "submit"; send.textContent = "পাঠান";
    commentForm.append(input, send);
    commentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      try {
        // Comment data is appended to the post document. For a large production app, use a separate comments collection.
        await updateDoc(doc(db, "posts", id), { comments: arrayUnion({ uid: currentUser.uid, authorName: nameFromUser(currentUser), text, createdAt: new Date().toISOString() }) });
        input.value = "";
      } catch (e) { alert(cleanError(e)); }
    });
    commentBtn.addEventListener("click", () => { input.focus(); });
    card.append(head, body, actions, comments, commentForm);
    list.append(card);
  });
}
function startFeed() {
  stopListening();
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  stopFeed = onSnapshot(q, renderFeed, (error) => {
    $("feed-list").textContent = cleanError(error);
  });
}

$("show-login").addEventListener("click", () => {
  $("show-login").classList.add("active"); $("show-signup").classList.remove("active");
  $("login-form").classList.remove("hidden"); $("signup-form").classList.add("hidden"); say(authMessage, "");
});
$("show-signup").addEventListener("click", () => {
  $("show-signup").classList.add("active"); $("show-login").classList.remove("active");
  $("signup-form").classList.remove("hidden"); $("login-form").classList.add("hidden"); say(authMessage, "");
});

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!requireConfigured()) return;
  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  if (!name) return say(authMessage, "আপনার নাম লিখুন।");
  try {
    say(authMessage, "অ্যাকাউন্ট তৈরি হচ্ছে…", true);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    await setDoc(doc(db, "users", result.user.uid), { displayName: name, email, createdAt: serverTimestamp() });
    await sendEmailVerification(result.user);
    say(authMessage, "");
    showVerification(result.user);
  } catch (error) { say(authMessage, cleanError(error)); }
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!requireConfigured()) return;
  try {
    say(authMessage, "লগইন হচ্ছে…", true);
    await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value);
    say(authMessage, "");
  } catch (error) { say(authMessage, cleanError(error)); }
});

$("forgot-password").addEventListener("click", async () => {
  if (!requireConfigured()) return;
  const email = $("login-email").value.trim();
  if (!email) return say(authMessage, "আগে ইমেইল ঘরে আপনার ইমেইল লিখুন।");
  try { await sendPasswordResetEmail(auth, email); say(authMessage, "পাসওয়ার্ড রিসেট করার লিংক ইমেইলে পাঠানো হয়েছে।", true); }
  catch (error) { say(authMessage, cleanError(error)); }
});

$("check-verified").addEventListener("click", async () => {
  if (!auth?.currentUser) return;
  try {
    await reload(auth.currentUser);
    if (auth.currentUser.emailVerified) {
      say(verifyMessage, "ইমেইল যাচাই হয়েছে। লোড হচ্ছে…", true);
    } else {
      say(verifyMessage, "এখনো verification দেখা যাচ্ছে না। ইমেইলের লিংক খুলে আবার চেষ্টা করুন।");
    }
  } catch (error) { say(verifyMessage, cleanError(error)); }
});
$("resend-verification").addEventListener("click", async () => {
  try {
    if (!auth?.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    say(verifyMessage, "নতুন verification link পাঠানো হয়েছে। Inbox/Spam দেখুন।", true);
  } catch (error) { say(verifyMessage, cleanError(error)); }
});
$("verify-logout").addEventListener("click", () => signOut(auth));
$("logout-button").addEventListener("click", () => signOut(auth));

$("post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser?.emailVerified) return;
  const text = $("post-text").value.trim();
  if (!text) return;
  try {
    await addDoc(collection(db, "posts"), {
      text, authorUid: currentUser.uid, authorName: nameFromUser(currentUser),
      likes: [], comments: [], createdAt: serverTimestamp()
    });
    $("post-text").value = "";
  } catch (error) { alert(cleanError(error)); }
});

$("year").textContent = new Date().getFullYear();

if (!isConfigured) {
  say(authMessage, "ওয়েবসাইটের ফাইল প্রস্তুত। বাস্তব অ্যাকাউন্ট চালু করতে README-এর Firebase setup অনুসরণ করে firebase-config.js পূরণ করুন।");
  showView("auth-view");
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (!user) { stopListening(); showView("auth-view"); return; }
      try { await reload(user); } catch {}
      currentUser = auth.currentUser;
      if (!currentUser.emailVerified) { showVerification(currentUser); return; }
      setUserDetails(currentUser);
      showView("app-view");
      startFeed();
    });
  } catch (error) {
    say(authMessage, `Firebase চালু করা যায়নি: ${error.message}`);
    showView("auth-view");
  }
}

// ===============================
// SkyLink Profile & Bio
// ===============================

function showProfileSection(section) {
  $("feed-view").classList.toggle("hidden", section !== "feed");
  $("profile-view").classList.toggle("hidden", section !== "profile");
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function updateProfilePreview(data = {}) {
  const name = data.displayName || nameFromUser(currentUser);
  const photo = safeImageUrl(data.photoURL || "");
  const cover = safeImageUrl(data.coverURL || "");

  $("profile-preview-name").textContent = name;
  $("profile-preview-bio").textContent = data.bio || "এখনো কোনো Bio লেখা হয়নি।";

  const avatar = $("profile-preview-avatar");
  avatar.textContent = name.slice(0, 1).toUpperCase();
  avatar.style.backgroundImage = photo ? `url("${photo}")` : "none";
  avatar.style.backgroundSize = "cover";
  avatar.style.backgroundPosition = "center";

  const coverElement = $("profile-preview-cover");
  coverElement.style.backgroundImage = cover ? `url("${cover}")` : "none";
  coverElement.style.backgroundSize = "cover";
  coverElement.style.backgroundPosition = "center";
}

async function loadProfile() {
  if (!currentUser) return;

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const profileSnap = await getDoc(userRef);
    const data = profileSnap.exists() ? profileSnap.data() : {};

    $("edit-display-name").value =
      data.displayName || nameFromUser(currentUser);

    $("edit-bio").value = data.bio || "";
    $("edit-birthday").value = data.birthday || "";
    $("edit-country").value = data.country || "";
    $("edit-district").value = data.district || "";
    $("edit-photo-url").value = data.photoURL || "";
    $("edit-cover-url").value = data.coverURL || "";

    updateProfilePreview({
      ...data,
      displayName: data.displayName || nameFromUser(currentUser)
    });
  } catch (error) {
    say($("profile-message"), cleanError(error));
  }
}

$("profile-link").addEventListener("click", async (event) => {
  event.preventDefault();
  showProfileSection("profile");
  await loadProfile();
});

$("home-link").addEventListener("click", (event) => {
  event.preventDefault();
  showProfileSection("feed");
});

$("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser?.emailVerified) {
    return say($("profile-message"), "আগে ইমেইল যাচাই করুন।");
  }

  const displayName = $("edit-display-name").value.trim();
  const bio = $("edit-bio").value.trim();
  const birthday = $("edit-birthday").value;
  const country = $("edit-country").value.trim();
  const district = $("edit-district").value.trim();
  const photoURL = $("edit-photo-url").value.trim();
  const coverURL = $("edit-cover-url").value.trim();

  if (!displayName) {
    return say($("profile-message"), "আপনার নাম লিখুন।");
  }

  if (displayName.length > 60 || bio.length > 150 ||
      country.length > 80 || district.length > 80 ||
      birthday.length > 10 || photoURL.length > 2048 ||
      coverURL.length > 2048) {
    return say($("profile-message"), "কোনো একটি তথ্য নির্ধারিত সীমার চেয়ে বড় হয়েছে।");
  }

  if (photoURL && !safeImageUrl(photoURL)) {
    return say($("profile-message"), "Profile Photo URL সঠিক নয়।");
  }

  if (coverURL && !safeImageUrl(coverURL)) {
    return say($("profile-message"), "Cover Photo URL সঠিক নয়।");
  }

  try {
    say($("profile-message"), "Profile Save হচ্ছে…", true);

    await updateDoc(doc(db, "users", currentUser.uid), {
      displayName,
      bio,
      birthday,
      country,
      district,
      photoURL,
      coverURL
    });

    await updateProfile(currentUser, { displayName });

    currentUser = auth.currentUser;
    setUserDetails(currentUser);

    updateProfilePreview({
      displayName, bio, photoURL, coverURL
    });

    say($("profile-message"), "আপনার Profile সফলভাবে Save হয়েছে।", true);
  } catch (error) {
    say($("profile-message"), cleanError(error));
  }
});