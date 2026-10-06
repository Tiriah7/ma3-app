export default function StatCard({ label, value, sub, accent = false, warn = false }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm border ${accent ? 'bg-brand-600 text-white border-brand-700' : 'bg-white border-gray-200'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-3xl font-bold mt-1 ${warn ? 'text-red-600' : accent ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1 ${accent ? 'text-brand-200' : 'text-gray-400'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}