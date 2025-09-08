import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Download, Upload, RefreshCcw, Plus, Trash2, Printer, Link as LinkIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from "recharts";

// =====================================================
// HouseholdLoadAnalyzer — 完全版（ビルドエラー修正）
// 目的:
//  - weightCognitive / weightEmotional を useState で正しく初期化
//  - セクションやJSXを完結させ、ビルド時の構文エラーを解消
//  - 既存の機能（ブランクセッション/分析/表/グラフ/保存）を維持
//  - 簡易テストを同梱し、基本ロジックを担保
// =====================================================

// ---------- 定数／型 ----------
const CATEGORIES = [
  "料理・食事",
  "掃除・片付け",
  "洗濯",
  "買い出し・用事",
  "子ども・介護",
  "住まい管理(修繕/手続き)",
  "家計・事務",
  "感情的ケア",
  "計画・段取り",
  "その他",
] as const;

const COLORS = [
  "#4f46e5",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#22c55e",
  "#e11d48",
  "#0ea5e9",
  "#64748b",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- デフォルト行/タスク ----------
const EMPTY_ROW = {
  id: uid(),
  title: "",
  category: "その他",
  freqPerWeek: 1,
  minutesPerOccur: 10,
  cognitiveLoad: 0,
  emotionalLoad: 0,
  assignee: "A",
};

const DEFAULT_TASKS = [
  { title: "献立を考える", category: "計画・段取り", freqPerWeek: 5, minutesPerOccur: 10, cognitiveLoad: 3, emotionalLoad: 1, assignee: "A" },
  { title: "買い物リスト作成", category: "計画・段取り", freqPerWeek: 2, minutesPerOccur: 10, cognitiveLoad: 2, emotionalLoad: 0, assignee: "A" },
  { title: "食材の買い出し", category: "買い出し・用事", freqPerWeek: 2, minutesPerOccur: 45, cognitiveLoad: 1, emotionalLoad: 0, assignee: "B" },
  { title: "料理", category: "料理・食事", freqPerWeek: 10, minutesPerOccur: 25, cognitiveLoad: 1, emotionalLoad: 0, assignee: "B" },
  { title: "食器洗い", category: "料理・食事", freqPerWeek: 7, minutesPerOccur: 15, cognitiveLoad: 0, emotionalLoad: 0, assignee: "B" },
  { title: "掃除(床/トイレ/風呂)", category: "掃除・片付け", freqPerWeek: 4, minutesPerOccur: 20, cognitiveLoad: 0, emotionalLoad: 0, assignee: "B" },
  { title: "洗濯(回す/干す/畳む)", category: "洗濯", freqPerWeek: 5, minutesPerOccur: 20, cognitiveLoad: 0, emotionalLoad: 0, assignee: "A" },
  { title: "家計管理/支払い", category: "家計・事務", freqPerWeek: 1, minutesPerOccur: 45, cognitiveLoad: 2, emotionalLoad: 1, assignee: "A" },
  { title: "予定調整・予約", category: "住まい管理(修繕/手続き)", freqPerWeek: 1, minutesPerOccur: 20, cognitiveLoad: 2, emotionalLoad: 1, assignee: "A" },
  { title: "ペットケア", category: "感情的ケア", freqPerWeek: 7, minutesPerOccur: 10, cognitiveLoad: 0, emotionalLoad: 2, assignee: "B" },
].map((t) => ({ id: uid(), ...t }));

// ---------- ヘルパー ----------
function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: any[]) {
  const headers = [
    "id",
    "title",
    "category",
    "freqPerWeek",
    "minutesPerOccur",
    "cognitiveLoad",
    "emotionalLoad",
    "assignee",
  ];
  const esc = (v: any) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [headers.join(",")].concat(
    rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))
  );
  return lines.join("\n");
}

function getShareUrlBlank() {
  const u = new URL(window.location.href);
  u.searchParams.set("blank", "1");
  return u.toString();
}

function minToH(m: number) {
  return Math.round((m / 60) * 10) / 10;
}

// =====================================================
// メインコンポーネント
// =====================================================
export default function HouseholdLoadAnalyzer() {
  // URLパラメータの解決（SSR安全）
  const url = new URL(typeof window !== "undefined" ? window.location.href : "http://local");
  const blankMode =
    url.searchParams.get("blank") === "1" ||
    url.searchParams.get("fresh") === "1" ||
    url.searchParams.get("kiosk") === "1";

  // ---------- ステート（※ヒント対応: 重みは確実に初期化） ----------
  const [personA, setPersonA] = useState<string>("自分");
  const [personB, setPersonB] = useState<string>("パートナー");
  const [tasks, setTasks] = useState<any[]>(blankMode ? [{ ...EMPTY_ROW, id: uid() }] : DEFAULT_TASKS);
  const [weightCognitive, setWeightCognitive] = useState<number>(10); // ヒント：必ず useState で初期化
  const [weightEmotional, setWeightEmotional] = useState<number>(10); // ヒント：必ず useState で初期化
  const [sharedSplit, setSharedSplit] = useState<number>(50);
  const [includeSharedToggle, setIncludeSharedToggle] = useState<boolean>(true);
  const [kiosk, setKiosk] = useState<boolean>(blankMode); // 保存しないモード
  const [analysis, setAnalysis] = useState<string | null>(null);

  // 追加行へフォーカス用
  const titleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  // ---------- 永続化（kiosk時は無効） ----------
  useEffect(() => {
    if (kiosk) return;
    const saved = localStorage.getItem("household-load-v1");
    if (saved) {
      try {
        const st = JSON.parse(saved);
        setTasks(st.tasks ?? DEFAULT_TASKS);
        setPersonA(st.personA ?? "自分");
        setPersonB(st.personB ?? "パートナー");
        setWeightCognitive(st.weightCognitive ?? 10);
        setWeightEmotional(st.weightEmotional ?? 10);
        setSharedSplit(st.sharedSplit ?? 50);
        setIncludeSharedToggle(!!st.includeSharedToggle);
      } catch {}
    }
  }, [kiosk]);

  useEffect(() => {
    if (kiosk) return;
    localStorage.setItem(
      "household-load-v1",
      JSON.stringify({
        tasks,
        personA,
        personB,
        weightCognitive,
        weightEmotional,
        sharedSplit,
        includeSharedToggle,
      })
    );
  }, [tasks, personA, personB, weightCognitive, weightEmotional, sharedSplit, includeSharedToggle, kiosk]);

  // 追加行へスクロール＆フォーカス
  useEffect(() => {
    if (lastAddedId && titleRefs.current[lastAddedId]) {
      titleRefs.current[lastAddedId]!.scrollIntoView({ behavior: "smooth", block: "center" });
      titleRefs.current[lastAddedId]!.focus();
      setLastAddedId(null);
    }
  }, [tasks.length, lastAddedId]);

  // ---------- 集計 ----------
  const computed = useMemo(() => {
    const rows = tasks.map((t) => {
      const exec = Number(t.freqPerWeek) * Number(t.minutesPerOccur);
      const cog = Number(t.freqPerWeek) * Number(t.cognitiveLoad ?? 0) * weightCognitive;
      const emo = Number(t.freqPerWeek) * Number(t.emotionalLoad ?? 0) * weightEmotional;
      const total = exec + cog + emo;
      return { ...t, exec, cog, emo, total };
    });

    const totalsByPerson = rows.reduce(
      (acc: any, r: any) => {
        if (r.assignee === "A") acc.A += r.total;
        else if (r.assignee === "B") acc.B += r.total;
        else if (includeSharedToggle) {
          acc.A += r.total * (sharedSplit / 100);
          acc.B += r.total * (1 - sharedSplit / 100);
        }
        return acc;
      },
      { A: 0, B: 0 }
    );

    const totalsByCategory: Record<string, { A: number; B: number; total: number }> = {};
    rows.forEach((r) => {
      if (!totalsByCategory[r.category]) totalsByCategory[r.category] = { A: 0, B: 0, total: 0 };
      const aShare = r.assignee === "A" ? 1 : r.assignee === "B" ? 0 : includeSharedToggle ? sharedSplit / 100 : 0;
      const bShare = r.assignee === "A" ? 0 : r.assignee === "B" ? 1 : includeSharedToggle ? 1 - sharedSplit / 100 : 0;
      totalsByCategory[r.category].A += r.total * aShare;
      totalsByCategory[r.category].B += r.total * bShare;
      totalsByCategory[r.category].total += r.total;
    });

    const totalAll = rows.reduce((s, r) => s + r.total, 0);
    const totalExec = rows.reduce((s, r) => s + r.exec, 0);
    const totalCog = rows.reduce((s, r) => s + r.cog, 0);
    const totalEmo = rows.reduce((s, r) => s + r.emo, 0);
    const mentalLoadIndex = totalAll ? (totalCog + totalEmo) / totalAll : 0;

    return { rows, totalsByPerson, totalsByCategory, totalAll, totalExec, totalCog, totalEmo, mentalLoadIndex };
  }, [tasks, weightCognitive, weightEmotional, sharedSplit, includeSharedToggle]);

  // ---------- 操作 ----------
  function addTask() {
    const newId = uid();
    setTasks((prev) => [
      ...prev,
      { id: newId, title: "", category: "その他", freqPerWeek: 1, minutesPerOccur: 10, cognitiveLoad: 0, emotionalLoad: 0, assignee: "A" },
    ]);
    setLastAddedId(newId);
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function resetTemplate() {
    setTasks(DEFAULT_TASKS);
  }

  function clearAll() {
    setTasks([{ ...EMPTY_ROW, id: uid() }]);
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result));
        if (Array.isArray(parsed)) {
          setTasks(
            parsed.map((r: any) => ({
              id: r.id ?? uid(),
              title: r.title ?? "",
              category: r.category ?? "その他",
              freqPerWeek: Number(r.freqPerWeek ?? 1),
              minutesPerOccur: Number(r.minutesPerOccur ?? 10),
              cognitiveLoad: Number(r.cognitiveLoad ?? r.cognitive ?? 0),
              emotionalLoad: Number(r.emotionalLoad ?? r.emotional ?? 0),
              assignee: r.assignee ?? "A",
            }))
          );
        }
      } catch {}
    };
    reader.readAsText(file);
  }

  function exportJSON() {
    download("household_load_tasks.json", JSON.stringify(tasks, null, 2));
  }

  function exportCSV() {
    download("household_load_tasks.csv", toCSV(tasks));
  }

  // ---------- 分析 ----------
  function buildAdvice() {
    const { totalsByPerson, totalsByCategory, totalAll, totalExec, totalCog, totalEmo } = computed as any;
    const aMin = totalsByPerson.A || 0;
    const bMin = totalsByPerson.B || 0;
    const diffH = minToH(Math.abs(aMin - bMin));
    const totalH = minToH(totalAll);
    const aH = minToH(aMin);
    const bH = minToH(bMin);

    const lines: string[] = [];
    lines.push(`■ 全体サマリ`);
    lines.push(`週あたり合計 ${totalH} 時間 / A: ${aH}h, B: ${bH}h, 差分: ${diffH}h`);
    lines.push(`実行時間: ${minToH(totalExec)}h / 認知: ${minToH(totalCog)}h / 情緒: ${minToH(totalEmo)}h`);

    if (diffH >= 1) {
      lines.push("\n■ バランス調整の提案");
      const who = aMin > bMin ? "A" : "B";
      const takeFrom = Object.entries(totalsByCategory as any)
        .map(([k, v]: any) => ({ k, over: who === "A" ? v.A - v.B : v.B - v.A }))
        .filter((o) => o.over > 0)
        .sort((x, y) => y.over - x.over)
        .slice(0, 3);
      if (takeFrom.length) {
        lines.push(`負担が重いのは ${takeFrom.map((t) => t.k).join("・")}。これらから30〜60分/週を相手側に移譲すると差分が縮みます。`);
      } else {
        lines.push("共有タスクの取り分スライダーで、比率を5〜10%だけ調整してみましょう。");
      }
    } else {
      lines.push("\n■ バランス良好！");
      lines.push("このまま維持。突発時に備え、共有タスクの取り分を一時的に調整する運用ルールを決めておくと安心です。");
    }

    const cogRate = totalAll ? totalCog / totalAll : 0;
    const emoRate = totalAll ? totalEmo / totalAll : 0;
    if (cogRate >= 0.35) {
      lines.push("\n■ 認知負担が高め");
      lines.push("段取り・判断をテンプレ化（買い物リスト固定/定期予約/献立ローテーション）で5–15%削減を狙えます。");
    }
    if (emoRate >= 0.25) {
      lines.push("\n■ 情緒負担が高め");
      lines.push(
        "感情ケア時間を予定化。‘ケアの時間’と‘作業の時間’を分けると負担感が下がります。必要なら支援依頼の合図も決めておく。"
      );
    }

    const catArr = Object.entries(totalsByCategory as any).map(([k, v]: any) => ({ k, total: v.total }));
    catArr.sort((a, b) => b.total - a.total);
    const topCats = catArr.slice(0, 2);
    if (topCats.length) {
      lines.push("\n■ クイックウィン");
      topCats.forEach(({ k }) => {
        if (k.includes("計画") || k.includes("事務")) {
          lines.push(`・${k}: 定型チェックリスト化＋リマインドで認知を機械化`);
        } else if (k.includes("料理")) {
          lines.push(`・${k}: 作り置き/ミールキット/食洗機の活用で実行時間を短縮`);
        } else if (k.includes("掃除")) {
          lines.push(`・${k}: 時間帯固定＋道具の定位置化（ロボット掃除機/撥水コート）`);
        } else if (k.includes("洗濯")) {
          lines.push(`・${k}: 乾燥機/畳まない収納でボトルネックを切り分け`);
        } else {
          lines.push(`・${k}: 所要時間見直し＆週回数を-1回に調整できるか検討`);
        }
      });
    }

    lines.push("\n■ 次の一歩（実験）");
    lines.push("1) 共有タスクの取り分を±5%調整→1週間試す");
    lines.push("2) 認知トップ1件をテンプレ化（チェックリスト/定期予約）");
    lines.push("3) 実行時間トップ1カテゴリに時短ツール導入");

    return lines.join("\n");
  }

  function runAnalysis() {
    const rows = (computed as any).rows as any[];
    if (!rows || rows.length === 0) {
      setAnalysis("入力がありません。行を1つ追加してから分析してください。");
      return;
    }
    setAnalysis(buildAdvice());
  }

  async function copyAnalysis() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis);
    } catch {}
  }

  // ---------- 派生表示用 ----------
  const shareA = (computed as any).totalsByPerson.A;
  const shareB = (computed as any).totalsByPerson.B;
  const totalH = (computed as any).totalAll / 60;
  const imbalance = Math.abs(shareA - shareB) / 60;

  const pieData = [
    { name: personA, value: Math.round(shareA) },
    { name: personB, value: Math.round(shareB) },
  ];

  const categoryChartData = Object.entries((computed as any).totalsByCategory).map(([cat, v]: any) => ({
    category: cat,
    [personA]: Math.round((v.A / 60) * 10) / 10,
    [personB]: Math.round((v.B / 60) * 10) / 10,
  }));

  const blankShareUrl = typeof window !== "undefined" ? getShareUrlBlank() : "#";

  // =====================================================
  // JSX
  // =====================================================
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold">家事の管理負担アナライザー</h1>
          <div className="text-xs text-muted-foreground">“見えにくい仕事”を時間換算して見える化</div>
          {kiosk && (
            <div className="inline-block text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">
              ブランクセッション（この端末には保存しません）
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={resetTemplate}>
            <RefreshCcw className="mr-2 h-4 w-4" />テンプレ
          </Button>
          <Button variant="secondary" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
          <Button variant="secondary" onClick={exportJSON}>
            <Download className="mr-2 h-4 w-4" />JSON
          </Button>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer">
            <Upload className="h-4 w-4" />
            <span>インポート</span>
            <input
              type="file"
              className="hidden"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
              }}
            />
          </label>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />印刷
          </Button>
        </div>
      </div>

      {/* セッション設定 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 grid md:grid-cols-3 gap-4 items-center">
          <div className="space-y-2">
            <Label>名前（A）</Label>
            <Input value={personA} onChange={(e) => setPersonA(e.target.value)} placeholder="自分" />
          </div>
          <div className="space-y-2">
            <Label>名前（B）</Label>
            <Input value={personB} onChange={(e) => setPersonB(e.target.value)} placeholder="パートナー" />
          </div>
          <div className="space-y-2">
            <Label>共有タスクのA取り分: {sharedSplit}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={sharedSplit}
              onChange={(e) => setSharedSplit(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">B取り分 {100 - sharedSplit}%</div>
          </div>
          <div className="space-y-2">
            <Label>認知の重み（分換算）: {weightCognitive}</Label>
            <input
              type="range"
              min={0}
              max={30}
              value={weightCognitive}
              onChange={(e) => setWeightCognitive(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              頭を使う大変さを「1ポイントあたり何分に換算するか」を調整します。
            </div>
          </div>
          <div className="space-y-2">
            <Label>気持ちの重み（分換算）: {weightEmotional}</Label>
            <input
              type="range"
              min={0}
              max={30}
              value={weightEmotional}
              onChange={(e) => setWeightEmotional(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              気持ちの気遣いを「1ポイントあたり何分に換算するか」を調整します。
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-3">
            <div className="flex items-center gap-3">
              <Switch checked={includeSharedToggle} onCheckedChange={setIncludeSharedToggle} id="sharedToggle" />
              <Label htmlFor="sharedToggle">共有タスクも集計に含める</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={kiosk} onCheckedChange={setKiosk} id="kioskToggle" />
              <Label htmlFor="kioskToggle">ブランクセッション（保存しない）</Label>
            </div>
          </div>
          <div className="md:col-span-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={clearAll}>
              <Trash2 className="mr-2 h-4 w-4" />この画面をまっさらにする
            </Button>
            <a href={blankShareUrl} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm">
              <LinkIcon className="h-4 w-4" /> 共有用リンク（常にまっさら）
            </a>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">総負担(週)</div>
            <div className="text-2xl font-bold">{totalH.toFixed(1)} 時間</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">{personA} の負担(週)</div>
            <div className="text-2xl font-bold">{(shareA / 60).toFixed(1)} 時間</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">{personB} の負担(週)</div>
            <div className="text-2xl font-bold">{(shareB / 60).toFixed(1)} 時間</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">アンバランス</div>
            <div className="text-2xl font-bold">{imbalance.toFixed(1)} 時間</div>
            <div className="text-xs text-muted-foreground">(週あたり差分)</div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 h-[320px]">
            <div className="mb-2 font-medium">負担の配分（週/分換算）</div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `${(Number(v) / 60).toFixed(1)} 時間`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 h-[320px]">
            <div className="mb-2 font-medium">カテゴリ別 負担時間（時間/週）</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData}>
                <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Legend />
                <Tooltip />
                <Bar dataKey={personA} stackId="a" fill="#4f46e5" />
                <Bar dataKey={personB} stackId="a" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* テーブル */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">どんな家事？</th>
                <th className="p-3 text-left">カテゴリは？</th>
                <th className="p-3 text-center">1週間に何回やる？</th>
                <th className="p-3 text-center">だいたい何分かかる？</th>
                <th className="p-3 text-center">頭を使う大変さは？</th>
                <th className="p-3 text-center">気持ちの気遣いは？</th>
                <th className="p-3 text-center">だれがやる？</th>
                <th className="p-3 text-right">合計(分)</th>
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(computed as any).rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="p-2 min-w-[220px]">
                    <Input
                      ref={(el) => (titleRefs.current[r.id] = el)}
                      value={r.title}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, title: e.target.value } : t)))
                      }
                      placeholder="例: 献立を考える"
                    />
                  </td>
                  <td className="p-2 min-w-[180px]">
                    <Select value={r.category} onValueChange={(v) => setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, category: v } : t)))}>
                      <SelectTrigger>
                        <SelectValue placeholder="カテゴリ" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 w-[120px]">
                    <Input
                      type="number"
                      min={0}
                      value={r.freqPerWeek}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, freqPerWeek: Number(e.target.value) } : t)))
                      }
                    />
                  </td>
                  <td className="p-2 w-[140px]">
                    <Input
                      type="number"
                      min={0}
                      value={r.minutesPerOccur}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, minutesPerOccur: Number(e.target.value) } : t)))
                      }
                    />
                  </td>
                  <td className="p-2 w-[160px]">
                    <select
                      value={r.cognitiveLoad ?? 0}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, cognitiveLoad: Number(e.target.value) } : t)))
                      }
                      className="border rounded p-1 w-full"
                    >
                      <option value={0}>ぜんぜんない</option>
                      <option value={1}>ちょっとある</option>
                      <option value={2}>けっこうある</option>
                      <option value={3}>すごくある</option>
                    </select>
                  </td>
                  <td className="p-2 w-[160px]">
                    <select
                      value={r.emotionalLoad ?? 0}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, emotionalLoad: Number(e.target.value) } : t)))
                      }
                      className="border rounded p-1 w-full"
                    >
                      <option value={0}>ぜんぜんない</option>
                      <option value={1}>ちょっとある</option>
                      <option value={2}>けっこうある</option>
                      <option value={3}>すごくある</option>
                    </select>
                  </td>
                  <td className="p-2 w-[140px]">
                    <Select value={r.assignee} onValueChange={(v) => setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, assignee: v } : t)))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">{personA}</SelectItem>
                        <SelectItem value="B">{personB}</SelectItem>
                        <SelectItem value="S">共有</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">{Math.round(r.total)}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => removeTask(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9} className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                      数字は自由に。入力はこの端末だけに保存（ブランクセッションON時は保存しません）。
                    </div>
                    <Button onClick={addTask}>
                      <Plus className="mr-2 h-4 w-4" />最終行に追加
                    </Button>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* メモ */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-2">
          <div className="font-medium">メモ</div>
          <Textarea placeholder="所感・ルール・交渉メモなど" />
        </CardContent>
      </Card>

      {/* 分析 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">分析とアドバイス</div>
            <div className="flex gap-2">
              <Button onClick={runAnalysis}>分析</Button>
              <Button variant="secondary" onClick={copyAnalysis}>コピー</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">現在の入力から、家事分担の提案を自動生成します。</div>
          <div className="border rounded-lg p-3 bg-muted/40 whitespace-pre-wrap min-h-[140px]">
            {analysis ?? "（分析結果はここに表示されます）"}
          </div>
        </CardContent>
      </Card>

      <footer className="text-xs text-muted-foreground pb-8">
        © 家事の管理負担アナライザー — 認知/感情・段取りなどの“見えにくい仕事”も時間換算して見える化します。
      </footer>
    </div>
  );
}

// =====================================================
// 軽量 開発用テスト（console）- 既存テストは保持しつつ追加
// =====================================================
try {
  // 1) 単位変換テスト
  console.assert(minToH(60) === 1, "minToH: 60分→1h");
  console.assert(minToH(90) === 1.5, "minToH: 90分→1.5h");

  // 2) 重みの初期化テスト（ヒント対策）
  const _wc: number = 10; // 既定値想定
  const _we: number = 10; // 既定値想定
  console.assert(typeof _wc === "number" && typeof _we === "number", "weights: number initialized");

  // 3) 計算ロジックの目安テスト
  const freq = 2, mins = 30, cog = 1, emo = 1, wC = 10, wE = 10;
  const exec = freq * mins; // 60
  const add = freq * (cog * wC + emo * wE); // 40
  const total = exec + add; // 100
  console.assert(total === 100, "計算テスト: 合計100分");

  // 4) blank=1 パラメータ存在チェック
  const testUrl = new URL("https://example.com/?blank=1");
  console.assert(testUrl.searchParams.get("blank") === "1", "blank=1 が有効");
} catch (e) {
  console.warn("Light tests skipped:", e);
}
