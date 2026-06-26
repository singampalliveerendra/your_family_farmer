import type { CropBalance } from '@/lib/demand-supply'

type Props = {
  crops: CropBalance[]
  demandLabel?: string
  supplyLabel?: string
  unit?: string
}

// Mobile-first grouped bar graph: per crop, demand (orange) over supply (green),
// each bar scaled to the largest value across all crops. Pure CSS — no chart
// library, so it stays light on slow 4G.
export default function DemandSupplyChart({
  crops,
  demandLabel = 'Demand',
  supplyLabel = 'Supply',
  unit = 'kg',
}: Props) {
  const maxKg = Math.max(1, ...crops.flatMap((c) => [c.demand_kg, c.supply_kg]))

  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-orange-400" /> {demandLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-600" /> {supplyLabel}
        </span>
        <span className="ml-auto">{unit}</span>
      </div>

      <div className="space-y-3.5">
        {crops.map((c) => (
          <div key={c.crop}>
            <span className="text-sm font-semibold text-gray-800">{c.crop}</span>
            <div className="space-y-1 mt-1">
              <Bar value={c.demand_kg} max={maxKg} color="bg-orange-400" />
              <Bar value={c.supply_kg} max={maxKg} color="bg-green-600" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  // Give any non-zero value a sliver of width so it stays visible.
  const pct = value > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-[11px] text-gray-500 tabular-nums">{value}</span>
    </div>
  )
}
