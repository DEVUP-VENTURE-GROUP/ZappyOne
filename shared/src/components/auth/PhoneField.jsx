// An Indian mobile number: the +91 is fixed, so it is shown as text, never as a menu that does nothing.
export default function PhoneField({ value, onChange, onEnter, maxDigits = 10, autoFocus = true }) {
  return (
    <label className="flex h-[52px] items-center overflow-hidden rounded-btn border border-line-strong bg-white transition focus-within:border-zappy-600 focus-within:ring-2 focus-within:ring-zappy-100">
      <span className="flex h-full items-center border-r border-line bg-canvas px-3.5 text-[15px] font-semibold text-ink-700">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label="Mobile number"
        placeholder="Mobile number"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxDigits))}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[16px] font-medium tracking-wide text-ink-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-400"
      />
    </label>
  );
}
