// Session-only on purpose: the admin password gate only needs to survive
// navigation within one visit to the store, not across days — sessionStorage
// (not localStorage) means it's gone as soon as the tab closes.
const ADMIN_PASSWORD_KEY = "greenlens.admin-password";

export function getStoredAdminPassword(): string {
  try {
    return sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredAdminPassword(password: string): void {
  try {
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
  } catch {
    // Private browsing / storage disabled: the password still works for
    // the rest of this in-memory session via React state, it just won't
    // survive a reload. Not worth surfacing as an error.
  }
}

export function clearStoredAdminPassword(): void {
  try {
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  } catch {
    // See setStoredAdminPassword.
  }
}
