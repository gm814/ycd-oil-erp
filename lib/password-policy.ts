export const PASSWORD_PATTERN = "[A-Z][a-z][0-9]{6}";
export const PASSWORD_REGEX = new RegExp(`^${PASSWORD_PATTERN}$`);
export const PASSWORD_HINT = "حرف إنجليزي كبير، ثم حرف صغير، ثم 6 أرقام (8 خانات).";
