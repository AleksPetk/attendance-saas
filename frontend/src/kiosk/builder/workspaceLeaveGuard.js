let leaveChecker = null;
let skipNext = false;

export function setWorkspaceLeaveChecker(fn) {
  leaveChecker = fn;
}

export function skipNextWorkspaceLeaveCheck() {
  skipNext = true;
}

export function confirmWorkspaceLeave() {
  if (skipNext) {
    skipNext = false;
    return true;
  }
  if (typeof leaveChecker !== "function") return true;
  return leaveChecker();
}
