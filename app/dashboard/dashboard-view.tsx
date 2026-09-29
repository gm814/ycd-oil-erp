"use client";

import { useEffect, useState } from "react";
import LogoutButton from "./logout-button";
import styles from "./dashboard.module.css";

export type DashboardData = {
  name: string; branch: string; phase: string; live: boolean;
  navigation: { label: string; href: string; icon: string }[];
  actions: { label: string; detail: string; href: string; icon: string }[];
  kpis: { label: string; value: number; previous: number; money?: boolean; icon: string; color: string }[];
  payments: { label: string; value: number; color: string }[];
  trend: { label: string; sales: number; expenses: number }[];
  branches: { label: string; sales: number; expenses: number }[];
  orders: { id: string; plate: string; car: string; service: string; status: string }[];
  stock: { id: string; name: string; quantity: number; minimum: number }[];
  approvals: { id: string; type: string; number: string; date: string; href: string }[];
  alerts: { label: string; count: number; href: string }[];
};
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const paths: Record<string, string> = {
 home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
 car: "m4 10 2-6h12l2 6M3 10h18v9H3zM6 14h2m8 0h2M5 19v2m14-2v2",
 drop: "M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z",
 box: "m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 5l10 5",
 money: "M4 5h16v14H4zM1 8h3m16 8h3M12 8v8m2-7h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3",
 bank: "m2 8 10-6 10 6H2Zm3 3v8m5-8v8m4-8v8m5-8v8M2 22h20",
 users: "M16 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3M14 4a4 4 0 0 1 0 8m5 3a4 4 0 0 1 3 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
 document: "M6 2h9l5 5v15H6ZM14 2v6h6M9 12h8m-8 4h8",
 cart: "M2 3h3l3 13h11l3-10H6M9 20h1m7 0h1",
 tool: "M14 4a5 5 0 0 0-6 6L2 17l4 4 7-7a5 5 0 0 0 7-6l-4 3-3-3 3-4Z",
 chart: "M3 3v18h19M7 16v-4m5 4V8m5 8V5",
 clock: "M12 7v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
 ticket: "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4ZM15 5v14",
 search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
 bell: "M4 17h16l-2-4V8a6 6 0 0 0-12 0v5ZM10 21h4",
 menu: "M3 6h18M3 12h18M3 18h18",
 pin: "M12 22s8-8 8-13a8 8 0 0 0-16 0c0 5 8 13 8 13ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
 settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
};
function Icon({ name }: { name: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.document} /></svg>; }
function ReferenceArtwork({banner=false}:{banner?:boolean}) { return <svg viewBox={banner?"18 61 1296 210":"1330 2 204 108"} role="img" aria-label={banner?"وجهتك الإبداعية لزيوت وخدمات السيارات":"YCD OIL"} preserveAspectRatio="xMidYMid meet"><image href="/brand/dashboard-reference.jpeg" width="1536" height="1024"/></svg>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className={styles.empty}>{children}</p>; }
function LineChart({ data }: { data: DashboardData["trend"] }) {
 const max = Math.max(1, ...data.flatMap(d => [d.sales, d.expenses]));
 const points = (key: "sales" | "expenses") => data.map((d, i) => `${40 + i * 300 / Math.max(1, data.length - 1)},${150 - d[key] / max * 120}`).join(" ");
 return <svg className={styles.lineChart} viewBox="0 0 370 185" role="img" aria-label="المبيعات والمصروفات خلال آخر سبعة أيام">
 {[0,1,2,3].map(i=><g key={i}><line x1="40" x2="340" y1={30+i*40} y2={30+i*40} stroke="#eee"/><text x="34" y={34+i*40} textAnchor="end">{fmt(max*(3-i)/3)}</text></g>)}
 <polyline points={points("expenses")} fill="none" stroke="#939497" strokeWidth="3"/><polyline points={points("sales")} fill="none" stroke="#f18f21" strokeWidth="3"/>
 {data.map((d,i)=><g key={d.label}><circle cx={40+i*50} cy={150-d.sales/max*120} r="3" fill="#f18f21"/><text x={40+i*50} y="175" textAnchor="middle">{d.label}</text></g>)}
 </svg>;
}
export function DashboardView({ data }: { data: DashboardData }) {
 const [menu, setMenu] = useState(false); const [search, setSearch] = useState(""); const [now,setNow]=useState<Date|null>(null);
 useEffect(()=>{setNow(new Date()); const id=setInterval(()=>setNow(new Date()),60000); return ()=>clearInterval(id);},[]);
 const paymentTotal=data.payments.reduce((s,p)=>s+p.value,0); let offset=0;
 const gradient=data.payments.map(p=>{const from=offset; offset+=paymentTotal?p.value/paymentTotal*100:0;return `${p.color} ${from}% ${offset}%`;}).join(",");
 const notificationCount=data.alerts.reduce((s,a)=>s+a.count,0);
 return <main className={styles.app} dir="rtl">
 {menu&&<button className={styles.scrim} onClick={()=>setMenu(false)} aria-label="إغلاق القائمة"/>}
 <aside className={`${styles.sidebar} ${menu?styles.open:""}`}>
 <a href="/dashboard" className={styles.logo}><ReferenceArtwork/></a>
 <nav aria-label="أقسام النظام"><a className={styles.selected} href="/dashboard"><Icon name="home"/><span>الرئيسية</span><b>‹</b></a>
 {data.navigation.map(n=><a href={n.href} key={n.label}><Icon name={n.icon}/><span>{n.label}</span><b>‹</b></a>)}</nav>
 <a className={styles.support} href="/dashboard/account/security"><Icon name="settings"/><span>إعدادات الحساب<small>الأمان وكلمة المرور</small></span></a><div className={styles.logout}><LogoutButton/></div>
 </aside>
 <section className={styles.main}>
 <header className={styles.topbar}>
 <button className={styles.menuButton} onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="فتح قائمة الأقسام"><Icon name="menu"/></button>
 <div className={styles.clock}>{now?.toLocaleTimeString("en-GB",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"}) || "—"}</div><div className={styles.date}><Icon name="document"/>{now?.toLocaleDateString("ar-SA",{timeZone:"Asia/Riyadh",calendar:"gregory",day:"numeric",month:"long",year:"numeric"}) || "—"}</div>
 <div className={styles.branch}><Icon name="pin"/><span>{data.branch}</span></div>
 <div className={styles.search}><Icon name="search"/><input aria-label="البحث في أقسام النظام" placeholder="البحث في النظام..." value={search} onChange={e=>setSearch(e.target.value)}/>
 {search&&<div className={styles.results}>{data.navigation.filter(n=>n.label.includes(search)).map(n=><a key={n.label} href={n.href}>{n.label}</a>)}{!data.navigation.some(n=>n.label.includes(search))&&<span>لا توجد أقسام مطابقة</span>}</div>}</div>
 <a href="/dashboard/approvals" className={styles.notifications} aria-label={`التنبيهات: ${notificationCount}`}><Icon name="bell"/>{notificationCount>0&&<b>{notificationCount}</b>}</a>
 <div className={styles.profile}><Icon name="users"/><span>{data.name}<small>حساب المستخدم</small></span></div>
 </header>
 <div className={styles.body}>
 <section className={styles.hero} aria-label="وجهتك الإبداعية لزيوت وخدمات السيارات">
 <ReferenceArtwork banner/>
 </section>

 <section className={styles.kpis} aria-label="مؤشرات اليوم">{data.kpis.map(k=><article key={k.label}><div><h2>{k.label}</h2><strong>{fmt(k.value)}</strong></div><span className={styles.kpiIcon} style={{background:k.color}}><Icon name={k.icon}/></span><footer><span>أمس {fmt(k.previous)}</span><b className={k.value>=k.previous?styles.up:styles.down}>{k.previous?`${k.value>=k.previous?"↑":"↓"} ${fmt(Math.abs((k.value-k.previous)/k.previous*100))}%`:"—"}</b></footer></article>)}</section>
 <section className={styles.charts}>
 <article className={styles.panel}><div className={styles.panelHead}><h2>أداء الفروع</h2><span>هذا الأسبوع</span></div><small>المبيعات والمصروفات · ريال</small><div className={styles.bars}>
 {data.branches.map(b=>{const max=Math.max(1,...data.branches.flatMap(x=>[x.sales,x.expenses]));return <div key={b.label}><div className={styles.barPair}><i style={{height:`${Math.max(1,b.sales/max*145)}px`}} title={`المبيعات ${fmt(b.sales)}`}/><i style={{height:`${Math.max(1,b.expenses/max*145)}px`}} title={`المصروفات ${fmt(b.expenses)}`}/></div><strong>{b.label}</strong><small>{fmt(b.sales)} / {fmt(b.expenses)}</small></div>;})}</div><div className={styles.legend}><span>🟠 المبيعات</span><span>● المصروفات</span></div></article>
 <article className={styles.panel}><div className={styles.panelHead}><h2>طرق الدفع اليوم</h2><span>التحصيل الفعلي</span></div><div className={styles.paymentContent}><div className={styles.donut} style={{background:paymentTotal?`conic-gradient(${gradient})`:"#eceeef"}}><div><strong>{fmt(paymentTotal)}</strong><small>ريال</small></div></div><ul className={styles.paymentLegend}>{data.payments.map(p=><li key={p.label}><i style={{background:p.color}}/><span>{p.label}</span><b>{fmt(p.value)}</b><small>({paymentTotal?Math.round(p.value/paymentTotal*100):0}%)</small></li>)}</ul></div>{!paymentTotal&&<small className={styles.zeroNote}>لا توجد دفعات مسجلة اليوم</small>}</article>
 <article className={styles.panel}><div className={styles.panelHead}><h2>حركة المبيعات</h2><span>آخر 7 أيام</span></div><LineChart data={data.trend}/><div className={styles.legend}><span>🟠 المبيعات</span><span>● المصروفات</span></div></article>
 </section>
 <section className={styles.actions} aria-label="اختصارات العمليات">{data.actions.map(a=><a key={a.label} href={a.href}><Icon name={a.icon}/><strong>{a.label}</strong><small>{a.detail}</small></a>)}</section>
 <section className={styles.tables}>
 <article className={styles.panel}><div className={styles.panelHead}><h2>الطلبات بانتظار اعتمادك</h2><a href="/dashboard/approvals">عرض الكل</a></div><div className={styles.tableScroll}><table><thead><tr><th>#</th><th>نوع الطلب</th><th>الرقم</th><th>التاريخ</th></tr></thead><tbody>{data.approvals.map((a,i)=><tr key={a.id}><td>{i+1}</td><td><a href={a.href}>{a.type}</a></td><td dir="ltr">{a.number}</td><td>{a.date}</td></tr>)}</tbody></table></div>{!data.approvals.length&&<Empty>لا توجد طلبات بانتظار الاعتماد</Empty>}</article>
 <article className={styles.panel}><div className={styles.panelHead}><h2>المخزون المنخفض</h2><a href="/dashboard/inventory">عرض الكل</a></div><div className={styles.tableScroll}><table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead><tbody>{data.stock.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{s.name}</td><td className={styles.danger}>{fmt(s.quantity)}</td><td>{fmt(s.minimum)}</td><td><span className={styles.low}>منخفض</span></td></tr>)}</tbody></table></div>{!data.stock.length&&<Empty>لا توجد أصناف تحت الحد الأدنى</Empty>}</article>
 <article className={styles.panel}><div className={styles.panelHead}><h2>آخر السيارات المستلمة اليوم</h2><a href="/dashboard/service-orders">عرض الكل</a></div><div className={styles.tableScroll}><table><thead><tr><th>#</th><th>رقم اللوحة</th><th>السيارة</th><th>الخدمة</th><th>الحالة</th></tr></thead><tbody>{data.orders.map((o,i)=><tr key={o.id}><td>{i+1}</td><td><a href={`/dashboard/service-orders/${o.id}`}>{o.plate}</a></td><td>{o.car}</td><td>{o.service}</td><td><span className={styles.status}>{o.status}</span></td></tr>)}</tbody></table></div>{!data.orders.length&&<Empty>لم تُستلم سيارات اليوم بعد</Empty>}</article>
 </section>
 <section className={styles.alerts} aria-label="متابعة الإدارة">{data.alerts.filter(a=>a.count>0).map(a=><a key={a.label} href={a.href}>{a.label}<b>{a.count}</b></a>)}</section>
 <div className={styles.phase}><span className={data.live?styles.live:styles.preopening}>● {data.phase}</span><span>لوحة الإدارة العامة · تحديث البيانات عند فتح الصفحة</span><a href="/dashboard/readiness">جاهزية التشغيل ‹</a></div>
 <footer className={styles.footer}>YCD OIL · نظام الإدارة والتشغيل <span>جميع المبالغ بالريال السعودي · توقيت الرياض</span></footer>
 </div></section></main>;
}
