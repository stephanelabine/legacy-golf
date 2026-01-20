// src/storage/courseDataRemote.js
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

export const ADMIN_UID = "rxHCp4NkBGODHJJkXtemXcVcrjI3";

export function getUid() {
  return auth?.currentUser?.uid || null;
}

export function isAdmin() {
  const uid = getUid();
  return !!uid && uid === ADMIN_UID;
}

export async function readCourseRemote(courseId) {
  const uid = getUid();
  if (!uid) return null;

  const ref = doc(db, "courses", String(courseId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return snap.data() || null;
}

export async function writeCourseRemote(courseId, data, { merge = true } = {}) {
  if (!isAdmin()) throw new Error("not-admin");
  const ref = doc(db, "courses", String(courseId));
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: getUid(),
      schemaVersion: 1,
    },
    { merge }
  );
  return true;
}

export async function wipeCourseRemote(courseId) {
  if (!isAdmin()) throw new Error("not-admin");
  const ref = doc(db, "courses", String(courseId));
  await deleteDoc(ref);
  return true;
}
