import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">🌾</div>
      <h1 className="text-2xl font-extrabold text-gray-900">Page not found</h1>
      <p className="text-sm text-gray-500 mt-1">ఈ పేజీ కనుగొనబడలేదు</p>
      <Link
        href="/"
        className="mt-6 bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm active:bg-green-800"
      >
        Go to home / హోమ్‌కు వెళ్ళండి
      </Link>
    </main>
  )
}
