export function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export const haptics = {
  attack() { vibrate([30, 20, 60]); },
  blocked() { vibrate([15, 10, 15]); },
  takeDamage() { vibrate([80, 30, 80, 30, 120]); },
  win() { vibrate([100, 50, 100, 50, 200]); },
  lose() { vibrate([300]); },
  blockSuccess() { vibrate([20]); },
};
