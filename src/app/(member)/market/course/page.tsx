"use client";

// Candle 座標系統：0~100（100 為最高價，0 為最低價），對應 SVG 內的相對高度。
function Candle({ o, c, h, l, bull, label }: { o: number; c: number; h: number; l: number; bull: boolean; label: string }) {
  const H = 96;
  const scale = (v: number) => H - (v / 100) * (H - 16) - 8;
  const bodyTop = scale(Math.max(o, c));
  const bodyBot = scale(Math.min(o, c));
  const bodyH = Math.max(bodyBot - bodyTop, 3);
  const color = bull ? "#e11d48" : "#16a34a";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-slate-50 rounded-xl px-3 py-2">
        <svg width={40} height={H} viewBox={`0 0 40 ${H}`}>
          <line x1={20} x2={20} y1={scale(h)} y2={scale(l)} stroke={color} strokeWidth={1.6} />
          <rect x={13} y={bodyTop} width={14} height={bodyH} fill={color} rx={1.5} />
        </svg>
      </div>
      <span className="text-xs text-slate-500 text-center">{label}</span>
    </div>
  );
}

function CandleRow({ items }: { items: { o: number; c: number; h: number; l: number; bull: boolean; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 justify-center py-2">
      {items.map((it, i) => <Candle key={i} {...it} />)}
    </div>
  );
}

function TrendLine({ points, marks }: { points: [number, number][]; marks?: number[] }) {
  const w = 480, h = 160, pad = 20;
  const maxX = points[points.length - 1][0];
  const X = (v: number) => pad + (v / maxX) * (w - pad * 2);
  const Y = (v: number) => pad + ((100 - v) / 100) * (h - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${X(p[0])},${Y(p[1])}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {marks?.map((m, i) => (
        <line key={i} x1={pad} x2={w - pad} y1={Y(m)} y2={Y(m)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3,4" />
      ))}
      <path d={d} fill="none" stroke="#6366f1" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-1">
        <span className="w-1 h-4 bg-indigo-500 rounded-full inline-block" />
        {title}
      </h3>
      {subtitle && <p className="text-xs text-slate-400 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function TermList({ items }: { items: { name: string; tag?: { label: string; kind: "buy" | "sell" | "watch" }; body: string }[] }) {
  const tagCls = { buy: "bg-red-50 text-red-600", sell: "bg-emerald-50 text-emerald-600", watch: "bg-amber-50 text-amber-600" };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-4 px-5 py-3.5">
          <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            {it.name}
            {it.tag && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tagCls[it.tag.kind]}`}>{it.tag.label}</span>}
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">{it.body}</div>
        </div>
      ))}
    </div>
  );
}

function Grid2({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
      {items.map((it, i) => (
        <div key={i} className="bg-white p-4">
          <div className="text-sm font-semibold text-slate-800 mb-1">{it.title}</div>
          <div className="text-xs text-slate-500 leading-relaxed">{it.body}</div>
        </div>
      ))}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 overflow-x-auto mb-2">{children}</div>;
}

function Frac({ top, bot }: { top: string; bot: string }) {
  return (
    <span className="inline-flex flex-col items-center align-middle mx-1.5 text-xs leading-tight">
      <span className="border-b border-slate-500 px-1 pb-0.5">{top}</span>
      <span className="pt-0.5">{bot}</span>
    </span>
  );
}

function PlainList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-0">
      {items.map((it, i) => (
        <li key={i} className="text-xs text-slate-500 leading-relaxed py-2 border-b border-slate-50 last:border-0">{it}</li>
      ))}
    </ul>
  );
}

const TOC = [
  { id: "ch1", label: "K線基礎" },
  { id: "ch2", label: "K線組合型態" },
  { id: "ch3", label: "量價關係" },
  { id: "ch4", label: "型態學" },
  { id: "ch5", label: "波浪理論" },
  { id: "ch6", label: "均線與葛蘭碧法則" },
  { id: "ch7", label: "技術指標" },
  { id: "ch8", label: "基本面選股" },
  { id: "ch9", label: "綜合運用六步驟" },
];

export default function StockCoursePage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">股市課程</h1>
        <p className="text-slate-500 text-sm mt-1">
          K線判讀、量價關係、型態學、波浪理論、均線與技術指標、基本面選股——完整技術分析課程講義
        </p>
      </div>

      {/* 目錄 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TOC.map((t, i) => (
            <a key={t.id} href={`#${t.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
              <span className="font-mono text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {/* ===== CH1 K線基礎 ===== */}
      <div id="ch1" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.01</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">K線基礎</h2>
        <p className="text-xs text-slate-400 mb-5">一根K線記錄開盤、收盤、最高、最低四個價格。看懂單根K線的形狀，是所有技術分析的起點。</p>

        <SectionCard title="K線的構成"
          subtitle="紅K線收盤在上代表收盤價高於開盤價；黑（綠）K線開盤在上代表收盤價低於開盤價。上影線代表高檔有壓，下影線代表低檔有撐。紅K未必是漲、黑K未必是跌——要跟前一日收盤比較才知道漲跌。">
          <CandleRow items={[
            { o: 25, c: 78, h: 82, l: 22, bull: true, label: "長紅線" },
            { o: 78, c: 25, h: 82, l: 22, bull: false, label: "長陰線" },
            { o: 35, c: 55, h: 92, l: 32, bull: true, label: "上影陽線" },
            { o: 55, c: 72, h: 75, l: 15, bull: true, label: "下影陽線" },
            { o: 50, c: 52, h: 82, l: 20, bull: true, label: "十字線" },
            { o: 88, c: 90, h: 91, l: 15, bull: true, label: "T字線" },
            { o: 65, c: 78, h: 80, l: 20, bull: true, label: "陽線鐵鎚" },
            { o: 50, c: 50, h: 50, l: 50, bull: true, label: "一字線" },
          ]} />
        </SectionCard>

        <SectionCard title="單根K線的意義">
          <TermList items={[
            { name: "長紅線", tag: { label: "偏多", kind: "buy" }, body: "多頭極強尚有高點可期；若在低檔出現，漲勢會更持久。" },
            { name: "長陰線", tag: { label: "偏空", kind: "sell" }, body: "空頭極強尚有低點；若在高檔出現，後面容易重挫。" },
            { name: "小陽線／小陰線", body: "不論當天漲跌，分別代表多方／空方主導目前的盤勢格局。" },
            { name: "上影陽線", body: "具上升力道但上漲有壓，上影線越長，代表上檔壓力越大。低檔出現仍可續漲。" },
            { name: "上影黑線", body: "下跌力道比長黑緩和，但上檔壓力仍重，線越長壓力越大，格局仍看跌。" },
            { name: "下影陽線", body: "低檔有買盤進場，下影線越長，代表買盤承接力道越強。" },
            { name: "下影黑線", body: "高檔時陰線實體長過下影線，續跌機率高；低檔時下影線長過實體，容易反彈。" },
            { name: "陽（陰）線鐵鎚", body: "相對低檔出現是作多訊號；相對高檔出現代表追價意願轉弱，是翻空訊號。" },
            { name: "十字線", body: "開盤價與收盤價幾乎相同，代表多空力道均衡的變盤線。高檔出現向下反轉機會大，低檔出現向上反轉機會大。" },
            { name: "T字線／墓碑線", body: "高檔出現是翻空訊號，低檔出現是作多訊號——T字線的翻多訊號又比墓碑線更明顯。" },
            { name: "一字線", body: "開盤、收盤、最高、最低同一價位，代表當日股價飆漲或飆跌、幾乎沒有交易空間。" },
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH2 K線組合型態 ===== */}
      <div id="ch2" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.02</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">K線組合型態</h2>
        <p className="text-xs text-slate-400 mb-5">把連續兩根、三根、甚至五根以上的K線放在一起看，能讀出比單根K線更完整的多空攻防過程。</p>

        <SectionCard title="兩根K線組合">
          <TermList items={[
            { name: "覆蓋線", body: "大陽(陰)線次日出現大陰(陽)線覆蓋最高價，疑似短空(多)出現。" },
            { name: "包入線", body: "陽(陰)線次日出現大陰(陽)線覆蓋最高最低價，代表空(多)頭再度轉強。" },
            { name: "迫切線", body: "大陽線次日小陰線，高檔有賣壓宜觀望；大陰線次日小陽線，多空平手應提高警覺。" },
            { name: "懷抱線", body: "大陽線次日大陰線收在陽線實體內，多方居劣勢，未來二日無法覆蓋則短多結束（反之亦然）。" },
            { name: "孕育線", body: "陽線次日小陰線收在實體內，第三日續跌破前低，波段跌勢確立（陰轉陽則確立漲勢）。" },
            { name: "分離線", tag: { label: "謹慎", kind: "watch" }, body: "兩日開盤價相同，多受利多／利空激勵或主力特定操作，盤勢激烈投機，多空都要謹慎。" },
            { name: "會合線", body: "兩日收盤價相同，代表止跌回穩、或漲勢明顯受阻的訊號。" },
            { name: "平行線", body: "陽(陰)線連續出現兩日，代表上升(下跌)力道強勁，仍有高(低)點可期。" },
          ]} />
        </SectionCard>

        <SectionCard title="三根K線組合">
          <CandleRow items={[
            { o: 78, c: 25, h: 82, l: 22, bull: false, label: "夜星第1根" },
            { o: 82, c: 86, h: 90, l: 78, bull: true, label: "夜星第2根" },
            { o: 84, c: 30, h: 86, l: 26, bull: false, label: "夜星第3根" },
            { o: 15, c: 38, h: 40, l: 13, bull: true, label: "三陽線" },
            { o: 36, c: 60, h: 62, l: 34, bull: true, label: "續漲" },
            { o: 58, c: 84, h: 86, l: 56, bull: true, label: "續漲" },
          ]} />
          <div className="mt-3">
            <TermList items={[
              { name: "晨星／夜星", body: "大陰(陽)線次日出現小K線位於前一日實體下(上)方，第三日反轉出現，可能成為波段起點。" },
              { name: "三陽線／三陰線", body: "連三根同色實體，代表中多／中空訊號出現，唯應留意物極必反。" },
              { name: "前長後短型 / 前短後長型", body: "觀察是否跌破(突破)第一根K線的高低點，決定多空單該續抱或出場。" },
              { name: "階梯上升／階梯下降", body: "連續三日長上下影線，已大漲(跌)一段後出現，視為賣出(買進)訊號。" },
              { name: "一紅吃三(多)黑／一黑吃三(多)紅", body: "代表多(空)方力量已明顯轉強，後面可望有一波像樣的行情。" },
              { name: "上升／下降中併肩陽線", body: "連續兩根開盤價相同的陽線，屬多頭連續型態，出現在下降段則代表空頭回補。" },
            ]} />
          </div>
        </SectionCard>

        <SectionCard title="五根以上組合與經典型態">
          <Grid2 items={[
            { title: "上升三法", body: "連漲中出現三根小陰線但未跌破前陽線，隨後再拉出陽線，確立多方力道未歇，把握時機買進。" },
            { title: "下降三法", body: "連跌中一根大黑線後接三根小陽線，第四日大陰線吃掉小陽線，代表買盤仍弱，續跌機率高。" },
            { title: "最後包覆線", body: "底部／高檔反轉的訊號，需視次日是否跌破或突破確認訊號是否成立。" },
            { title: "上漲／下降插入線", body: "短期回檔或反彈但主趨勢不變，勿被單一根K線的假訊號迷惑。" },
            { title: "兩條插入線", body: "接近底部時買盤力量強大形成支撐，突破底部呈上升趨勢，可乘機買進。" },
            { title: "捨子線 / 孕育十字線", body: "下跌末端十字線次日收紅，多方奪回主導權；連漲後十字線孕育在大陽線中，暗示可能重挫。" },
            { title: "三顆星 / 連續下降三顆星", body: "三根小紅小黑代表市場觀望疲軟；三根跳空小陰線代表空方賣壓逐漸衰竭，接近探底。" },
            { title: "步步為營 / 上漲二顆星", body: "小陽線位於前波頂部附近，漲勢受阻有失速危險；帶量續漲則可能進入另一波漲勢。" },
            { title: "上吊陽線", body: "長下影線狀似買盤強勁，但需提防主力藉機拉高出貨，宜保守看待。" },
            { title: "盡頭線", body: "最高價未能超過前一天高點，代表上漲力道已盡，是賣出訊號。" },
            { title: "順沿線 / 反擊順沿線", body: "連續兩根下降陰線代表高點已現應盡快出場；次日若見大陽線，通常是主力拉高出貨的逃命線。" },
            { title: "雙鴉躍空 / 獨特三河底", body: "三根線形構成的頭部／底部反轉型態，關鍵在第二、三根線相對於第一根的開收盤位置。" },
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH3 量價關係 ===== */}
      <div id="ch3" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.03</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">量價關係</h2>
        <p className="text-xs text-slate-400 mb-5">價格的漲跌需要成交量支持才走得遠；量與價脫節（背離），往往是趨勢即將反轉的前兆。</p>

        <SectionCard title="價量八法循環" subtitle="一個完整的多空循環，量與價依序經過以下八個階段：">
          <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-loose text-center font-mono">
            價穩量增 → 價漲量增 → 價漲量穩 → 價漲量縮 → 價穩量縮 → 價跌量縮 → 價跌量穩 → 價跌量增 →（循環）
          </div>
        </SectionCard>

        <SectionCard title="八大量價原則">
          <PlainList items={[
            <><strong className="text-slate-700">有量即有價：</strong>股價要漲須有量推升，價創新高但量未創新高即是量價背離，代表漲勢已近末端。</>,
            <><strong className="text-slate-700">沒量即沒價：</strong>跌勢中下跌量增、上漲量縮，惜售心理讓成交量萎縮，但也代表後續跌幅有限。</>,
            <><strong className="text-slate-700">無量不可漲：</strong>無量卻上漲，不是頭部形成，就只是短暫反彈。</>,
            <><strong className="text-slate-700">有量不可跌：</strong>帶量下跌容易加劇多殺多，量縮才是止跌的必要條件。</>,
            <><strong className="text-slate-700">量先價行：</strong>新高量之後必有新高價、新低量之後必有新低價，量對價有預警作用。</>,
            <><strong className="text-slate-700">量價配合：</strong>漲勢中上漲量增、下跌量縮；跌勢中下跌量增、上漲量縮，才是健康的走勢。</>,
            <><strong className="text-slate-700">量價背離：</strong>常出現在趨勢末端，代表接下來的走勢很可能反轉。</>,
            <><strong className="text-slate-700">頭底爆量：</strong>漲勢末端爆量反轉向下形成頭部（籌碼由大戶轉散戶）；跌勢末端爆量反轉向上形成底部（籌碼由散戶轉大戶）。</>,
          ]} />
        </SectionCard>

        <SectionCard title="籌碼心理循環——科斯托蘭尼雞蛋">
          <Grid2 items={[
            { title: "最高點", body: "成交量大異常、持有人數最多；大戶賣、散戶買。" },
            { title: "中段（下滑）", body: "成交量增加、持有人數繼續減少；大戶等待、散戶追賣。" },
            { title: "最低點", body: "成交量很大、持有人數很少；大戶買、散戶賣。" },
            { title: "中段（回升）", body: "成交量增加、持有人數增加；大戶等待、散戶追漲。" },
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH4 型態學 ===== */}
      <div id="ch4" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.04</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">型態學（等幅測量法）</h2>
        <p className="text-xs text-slate-400 mb-5">股價在一段時間內走出的整體輪廓，往往比單一根K線更能預告接下來的方向與空間。</p>

        <SectionCard title="反轉型態">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <TrendLine points={[[0, 30], [1, 58], [2, 45], [3, 88], [4, 50], [5, 62], [6, 48], [7, 20]]} marks={[45]} />
              <p className="text-xs text-slate-500 text-center mt-1">頭肩頂（跌破頸線構成反轉）</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <TrendLine points={[[0, 85], [1, 20], [2, 55], [3, 24], [4, 90]]} marks={[50]} />
              <p className="text-xs text-slate-500 text-center mt-1">W底（突破頸線完成型態）</p>
            </div>
          </div>
          <TermList items={[
            { name: "頭肩頂 / 頭肩底", body: "跌(漲)破頸線構成反轉，最小跌(漲)幅＝頭部到頸線的垂直距離。無量破頸線可能拉回測試，帶量破頸線則不易再拉回。" },
            { name: "M頭 / W底", body: "第二個高(低)點量比第一個小，出現價量背離；帶量突破頸線即完成型態，最小漲(跌)幅＝頭部到頸線的垂直距離。" },
            { name: "島狀反轉", body: "通常島狀部位成交量最大，代表多空力量用盡；漲跌幅通常很快回到起漲(跌)點，最佳買賣點在第一個反轉缺口。" },
          ]} />
        </SectionCard>

        <SectionCard title="整理型態" subtitle="跌破上升線或突破下降線代表趨勢告一段落，進入整理；整理期間成交量會愈來愈小，直到再次跌破或突破趨勢線才宣告結束。">
          <Grid2 items={[
            { title: "旗形整理", body: "上升旗形（回檔）／下降旗形（反彈），型態邊界大致平行。" },
            { title: "三角形整理", body: "上升三角形（回檔）／下降三角形（反彈），型態邊界逐漸收斂。" },
            { title: "箱形整理", body: "股價在固定區間來回震盪（回檔或反彈皆可能出現）。" },
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH5 波浪理論 ===== */}
      <div id="ch5" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.05</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">波浪理論</h2>
        <p className="text-xs text-slate-400 mb-5">完整的一段趨勢，由五個推動波與三個修正波構成——「漲五跌三」，而且波中還有波。</p>

        <SectionCard title="波浪全貌">
          <div className="bg-slate-50 rounded-xl p-3">
            <TrendLine points={[[0, 20], [1, 42], [2, 30], [3, 72], [4, 52], [5, 90], [6, 64], [7, 40]]} />
          </div>
          <p className="text-xs text-slate-400 mt-2">上升五波：初升段(1)→修正(2)→主升段(3)→修正(4)→末升段(5)；回檔三波：反彈(A)→修正(B)→回跌(C)。</p>
        </SectionCard>

        <SectionCard title="上升趨勢線畫法">
          <div className="space-y-3">
            {[
              "先取起漲點與第二個低點連線，稱為「原始上升線」。",
              "由第一個高點畫一條平行線，用來預估第三波的高點。",
              "出現第四波後，改取第二、四波低點連線，稱為「修正後趨勢線」——一旦跌破，代表漲勢結束。",
              "由第三波高點畫平行線，預估第五波的高點。",
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold font-mono flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-slate-500 leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="波浪應用">
          <PlainList items={["類股輪動與資金配置", "波段高低點空間計算", "波段高低轉折時間計算"]} />
        </SectionCard>
      </div>

      {/* ===== CH6 均線與葛蘭碧 ===== */}
      <div id="ch6" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.06</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">移動平均線與葛蘭碧八大法則</h2>
        <p className="text-xs text-slate-400 mb-5">均線像一條會把股價拉回身邊的磁線，股價與均線的相對位置，是最經典的進出場判斷依據。</p>

        <SectionCard title="葛蘭碧八大法則">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[520px]">
              <thead>
                <tr className="text-slate-400 bg-slate-50">
                  <th className="text-left font-semibold px-3 py-2 w-8">#</th>
                  <th className="text-left font-semibold px-3 py-2">法則</th>
                  <th className="text-left font-semibold px-3 py-2">操作要訣</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { n: 1, rule: "股價突破移動平均線，且均線同時向上", note: "底部形成突破放量，中線操作", buy: true },
                  { n: 2, rule: "股價拉回，觸及上升中的移動平均線", note: "回檔盤整量縮價穩，短線買進", buy: true },
                  { n: 3, rule: "股價跌破均線，但均線仍然向上", note: "漲勢中拉回盤整，短線買進", buy: true },
                  { n: 4, rule: "股價上漲，但離均線太遠", note: "漲勢拉回且量價背離，短線賣出", buy: false },
                  { n: 5, rule: "股價跌破均線，且均線同時向下", note: "頭部形成破線爆量，中線操作", buy: false },
                  { n: 6, rule: "股價上漲，觸及下跌中的移動平均線", note: "跌勢反彈呈量價背離，短線賣出", buy: false },
                  { n: 7, rule: "股價突破均線，但均線仍然向下", note: "跌勢反彈呈量價背離，短線賣出", buy: false },
                  { n: 8, rule: "股價下跌，但離均線太遠", note: "跌勢反彈、盤整量價配合，短線買進", buy: true },
                ].map((r) => (
                  <tr key={r.n}>
                    <td className={`px-3 py-2.5 font-mono font-bold ${r.buy ? "text-red-500" : "text-emerald-600"}`}>{r.n}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.rule}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {r.note}
                      <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.buy ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>
                        {r.buy ? "買點" : "賣點"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="乖離率（BIAS）原理">
          <Formula>
            乖離率 ＝ <Frac top="股價 － K日移動平均線" bot="K日移動平均線" /> ＝ <Frac top="P － MA" bot="MA" />
          </Formula>
          <p className="text-xs text-slate-400 mb-3">均線像磁鐵，股價無論漲跌只要偏離太遠，都會被吸引拉回；正乖離過大代表獲利了結壓力大，負乖離過大代表停損殺出壓力大，兩者最終都會朝均線（零軸）修正。</p>
          <Grid2 items={[
            { title: "背離現象", body: "股價創新高但BIAS未創新高→回檔在即；股價創新低但BIAS未創新低→反彈在即。" },
            { title: "力道觀察", body: "漲勢中BIAS高點愈來愈低＝追高力量減弱；跌勢中BIAS低點愈來愈高＝殺低意願降低。" },
          ]} />
        </SectionCard>

        <SectionCard title="大盤 BIAS 參考歷史值（月線）">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[360px]">
              <thead>
                <tr className="text-slate-400 bg-slate-50">
                  <th className="text-left font-semibold px-3 py-2">均線天期</th>
                  <th className="text-left font-semibold px-3 py-2">賣出參考</th>
                  <th className="text-left font-semibold px-3 py-2">買進參考</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr><td className="px-3 py-2.5 text-slate-700">10日乖離</td><td className="px-3 py-2.5 font-mono text-red-500">+5%</td><td className="px-3 py-2.5 font-mono text-emerald-600">−4.5%</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">20日乖離</td><td className="px-3 py-2.5 font-mono text-red-500">+8%</td><td className="px-3 py-2.5 font-mono text-emerald-600">−7%</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">60日乖離</td><td className="px-3 py-2.5 font-mono text-red-500">+14%</td><td className="px-3 py-2.5 font-mono text-emerald-600">−11%</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">個股可依熱門股（5～7成）、冷門股（約3成）的幅度自行調整。</p>
        </SectionCard>
      </div>

      {/* ===== CH7 技術指標 ===== */}
      <div id="ch7" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.07</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">技術指標</h2>
        <p className="text-xs text-slate-400 mb-5">均量線、MACD、KD、RSI——四個最常被拿來輔助判斷買賣點的指標。</p>

        <SectionCard title="移動平均量（均量線）">
          <PlainList items={[
            "突破均量線且均量線上揚時買進；跌破均量線且均量線下跌時賣出。",
            "低量持續愈久，後面愈容易醞釀大行情；大量持續愈久，則要提防隨後的大跌。",
            "量先價行：均量線先上揚，移動平均線也會隨後上揚，價格上漲，反之亦然。",
            <span key="params" className="font-mono text-slate-400">常用參數：5、10、20、60、120、240 日</span>,
          ]} />
        </SectionCard>

        <SectionCard title="MACD 指數平滑異同移動平均線">
          <Formula>DIF（差離值）＝短天期移動平均線 － 長天期移動平均線</Formula>
          <Formula>MACD ＝ N 天內 DIF 的總和 ÷ N</Formula>
          <PlainList items={[
            "當日 DIF ＞ 當日 MACD → 漲勢；當日 DIF ＜ 當日 MACD → 跌勢。",
            "漲勢中短天期均線快速突破長天期，漲勢加溫是買點；差距縮小則衝高力減緩，可能回檔。",
            "跌勢中短天期均線快速跌破長天期，跌勢加快是賣點；差距縮小則跌勢趨緩，可能轉強。",
            "優點是買賣點明確、適合波段操作；缺點是盤整時容易失真，且無法預測絕對高低點，建議搭配日、週、月線合併使用。",
          ]} />
        </SectionCard>

        <SectionCard title="KD 隨機指標">
          <Formula>
            RSV ＝ <Frac top="當日收盤價 － 最近N天最低價" bot="最近N天最高價 － 最近N天最低價" /> × 100
          </Formula>
          <Formula>K值 ＝ 前一日K值 × 2/3 ＋ 當日RSV × 1/3</Formula>
          <Formula>D值 ＝ 前一日D值 × 2/3 ＋ 當日K值 × 1/3</Formula>
          <PlainList items={[
            "理論上80以上超買、20以下超賣，但常有鈍化現象；大多頭行情可放寬到85賣出/95超買，大空頭行情可放寬到15買進/10超賣。",
            "K值在低檔向上穿越D值＝黃金交叉，可買進；K值在高檔向下穿越D值＝死亡交叉，應賣出。",
            "KD同時到達買賣區間時訊號最準確，但此時也容易產生背離，需交叉比對。",
          ]} />
        </SectionCard>

        <SectionCard title="RSI 相對強弱指標">
          <Formula>
            N日RS ＝ <Frac top="N日內收盤上漲總和的平均值" bot="N日內收盤下跌總和的平均值" />
          </Formula>
          <Formula>
            N日RSI ＝ 100 － <Frac top="100" bot="1 ＋ RS" />
          </Formula>
          <PlainList items={[
            "RSI在80以上為超買，拉回機率高；20以下為超賣，上漲機率高。",
            "多頭背離：股價創新高但RSI未創新高，漲勢結束後容易大回檔。",
            "空頭背離：股價創新低但RSI未創新低，跌勢結束後容易大反彈。",
            "RSI轉折點多且快，月線最穩定、週線次之，日線在盤整期間較不可靠。",
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH8 基本面選股 ===== */}
      <div id="ch8" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.08</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">基本面選股</h2>
        <p className="text-xs text-slate-400 mb-5">技術面回答「何時進出」，基本面回答「該選誰」——景氣位階與財報數字，決定一檔股票值不值得留在觀察名單。</p>

        <SectionCard title="景氣循環四階段">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="text-slate-400 bg-slate-50">
                  <th className="text-left font-semibold px-3 py-2">項目</th>
                  <th className="text-left font-semibold px-3 py-2">繁榮</th>
                  <th className="text-left font-semibold px-3 py-2">衰退</th>
                  <th className="text-left font-semibold px-3 py-2">蕭條</th>
                  <th className="text-left font-semibold px-3 py-2">復甦</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-500">
                <tr><td className="px-3 py-2.5 text-slate-700">股價循環</td><td className="px-3 py-2.5">上漲→下跌（多頭）</td><td className="px-3 py-2.5">下跌（空頭）</td><td className="px-3 py-2.5">下跌（空頭）</td><td className="px-3 py-2.5">下跌→上漲（多頭）</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">金融政策</td><td className="px-3 py-2.5">緊張（通膨壓力）</td><td className="px-3 py-2.5">中立</td><td className="px-3 py-2.5">擴張（緊縮壓力）</td><td className="px-3 py-2.5">中立</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">利率循環</td><td className="px-3 py-2.5">上升</td><td className="px-3 py-2.5">下跌壓力</td><td className="px-3 py-2.5">下跌</td><td className="px-3 py-2.5">上升壓力</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">經濟成長率</td><td className="px-3 py-2.5">很高</td><td className="px-3 py-2.5">低</td><td className="px-3 py-2.5">低或負成長</td><td className="px-3 py-2.5">高</td></tr>
                <tr><td className="px-3 py-2.5 text-slate-700">失業率</td><td className="px-3 py-2.5">接近充分就業</td><td className="px-3 py-2.5">失業增加</td><td className="px-3 py-2.5">大量失業</td><td className="px-3 py-2.5">失業減少</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">谷底 → 復甦 → 成長 → 繁榮 → 衰退——挑選處於復甦及成長階段的產業最為有利。</p>
        </SectionCard>

        <SectionCard title="強弱股判斷">
          <Grid2 items={[
            { title: "主流股", body: "漲勢中漲幅超越大盤者，通常是該波段的主流股。" },
            { title: "主跌股", body: "跌勢中跌幅超越大盤者，通常是該波段的主跌股。" },
            { title: "回檔抗跌", body: "回檔過程中相對強勢的個股，下一波大盤上漲時通常表現較佳。" },
            { title: "反彈弱勢", body: "反彈過程中相對弱勢的個股，下一波大盤下跌時通常跌幅較大。" },
          ]} />
        </SectionCard>

        <SectionCard title="財報三指標">
          <TermList items={[
            { name: "營收成長率（單月>15%）", body: "觀察單月MoM／QoQ／YoY是否大於15%，用來尋找轉機股、確認持股是否持續成長；過去三年年成長率>15%則適合尋找長期趨勢向上的績優股（缺點是時效性較差）。" },
            { name: "稅前淨利成長率（>15%）", body: "需與營收成長率同步觀察，留意是否出現負成長，並逐季檢視；一次性業外收益宜排除，長期轉投資收入才可視為本業。" },
            { name: "毛利率下滑幅度", body: "判斷標準是毛利率連四季下滑幅度小於營收成長率，用來確認手中持股的賺錢能力是否正在轉差。" },
          ]} />
        </SectionCard>
      </div>

      {/* ===== CH9 綜合運用 ===== */}
      <div id="ch9" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 scroll-mt-20">
        <div className="text-xs font-mono text-indigo-500 mb-1">CH.09</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">綜合運用——判斷六步驟</h2>
        <p className="text-xs text-slate-400 mb-5">把前面八章串成一套實際下單前會走過的完整流程。</p>

        <div className="space-y-4">
          {[
            { title: "判斷大盤趨勢", body: "以「波浪理論」判斷大盤處於上漲或下跌格局，佐以景氣循環為證；輔以「型態學」觀察大盤是否有型態成型，並計算其空間。" },
            { title: "推算轉折時點", body: "以「波浪時空」推算目前趨勢預計結束的時間點，進而擬定波段操作策略。" },
            { title: "選股（一）基本面", body: "務必考慮營收成長率、毛利率、EPS、本益比，並進一步檢查流動比率、營益率等財務體質指標。" },
            { title: "選股（二）技術面", body: "用波浪理論／型態學判斷個股日週月位置並畫趨勢線與頸線；用葛蘭碧法則與指標觀察背離、交叉、乖離；用K線、量價、籌碼判斷買賣點；切入前擬定資金配置與停損停利點。" },
            { title: "持股中持續追蹤", body: "留意個股重大訊息、每月營收變化，跨季留意季報盈餘表現與毛利率變動、法人持股與資券變化，並定期複驗技術面。" },
            { title: "出場後保持紀律", body: "持股出脫後，千萬不急著進場，保持頭腦冷靜，再重覆上述五個步驟。" },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold font-mono flex items-center justify-center shrink-0">{i + 1}</span>
              <div>
                <div className="text-sm font-semibold text-slate-800 mb-0.5">{s.title}</div>
                <p className="text-xs text-slate-500 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-5">
          <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">補充・波段操作五階段</div>
          <div className="text-sm text-slate-700 font-medium">判斷 → 選股 → 買入 → 持有 → 賣出</div>
        </div>
      </div>

      <p className="text-xs text-slate-300 text-center py-4">內容僅供技術分析教學參考，不構成個股買賣建議</p>
    </div>
  );
}
