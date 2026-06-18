'use client'

import { useLang } from '@/lib/LanguageContext'

const TARGET = 10

export default function AddFarmerTab({ farmerCount }: { farmerCount: number }) {
  const { tx, L } = useLang()
  const progress = Math.min((farmerCount / TARGET) * 100, 100)

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-800">{tx.growingNetwork}</p>
          <p className="text-sm font-bold text-green-700">{farmerCount} / {TARGET}</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className="bg-green-600 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {tx.target.replace('{target}', String(TARGET))}
        </p>
      </div>
    </div>
  )
}
