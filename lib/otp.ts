/** Spaces represent empty cells so deleting one digit never moves the other five. */
export const otpSlots = (value: string) => Array.from({length: 6}, (_, i) => /\d/.test(value[i] ?? '') ? value[i] : '');
export const otpValue = (slots: string[]) => slots.map(digit => digit || ' ').join('').trimEnd();
export const isCompleteOtp = (value: string) => /^[0-9]{6}$/.test(value);
