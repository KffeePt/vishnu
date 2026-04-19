// No-op fallback for iOS Safari & unsupported browsers
const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const haptics = {
    // A light tap, good for tabs/buttons
    tap: () => canVibrate() && navigator.vibrate(10),

    // Three quick pulses for success
    success: () => canVibrate() && navigator.vibrate([30, 50, 30]),

    // Harsher, longer pattern for errors
    error: () => canVibrate() && navigator.vibrate([50, 30, 50, 30, 50]),

    // Very light, continuous feeling for dragging
    drag: () => canVibrate() && navigator.vibrate(15),
};
