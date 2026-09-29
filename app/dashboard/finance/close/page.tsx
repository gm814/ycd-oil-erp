import { redirect } from "next/navigation";

export default function LegacyFinancialClosePage() {
  redirect("/dashboard/finance/closes");
}
