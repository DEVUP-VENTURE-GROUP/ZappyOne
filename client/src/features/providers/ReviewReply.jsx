export default function ReviewReply({ reply, name }) {
  if (!reply?.text) return null;
  return (
    <div className="mt-2 rounded-btn bg-sunken px-3 py-2">
      <p className="text-[12px] font-semibold text-ink-700">Reply from {name || 'the pro'}</p>
      <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-900">{reply.text}</p>
    </div>
  );
}
