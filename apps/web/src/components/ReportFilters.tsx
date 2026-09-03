import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api/client";
import { Client, Project } from "../api/types";
import { Button, Field, FilterBar, Input, Select } from "./ui";
import { monthsAgoInput, todayInput } from "../utils/format";

export interface ReportFilterValues {
  from: string;
  to: string;
  clientId: string;
  projectId: string;
}

export function defaultReportFilters(): ReportFilterValues {
  return { from: monthsAgoInput(11), to: "", clientId: "", projectId: "" };
}

const presets: { label: string; months: number }[] = [
  { label: "Этот месяц", months: 0 },
  { label: "3 месяца", months: 2 },
  { label: "12 месяцев", months: 11 },
  { label: "Этот год", months: -1 },
];

/**
 * Period + client/project scope for PnL and ДДС. Presets cover what people
 * actually ask ("этот месяц", "год"), the date fields cover everything else;
 * a project scope rolls its subprojects in, a client scope catches
 * project-less subscriptions and sales.
 */
export function ReportFilters({ value, onChange }: { value: ReportFilterValues; onChange: (v: ReportFilterValues) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data.flatMap((p) => [p, ...(p.children ?? [])])));
  }, []);

  function applyPreset(months: number) {
    if (months < 0) {
      const y = new Date().getFullYear();
      onChange({ ...value, from: `${y}-01-01`, to: "" });
      return;
    }
    onChange({ ...value, from: monthsAgoInput(months), to: "" });
  }

  const isDefault = value.from === monthsAgoInput(11) && !value.to && !value.clientId && !value.projectId;

  return (
    <FilterBar>
      <div className="flex flex-wrap gap-1.5 self-end pb-0.5">
        {presets.map((p) => (
          <Button key={p.label} size="sm" variant="secondary" type="button" onClick={() => applyPreset(p.months)}>
            {p.label}
          </Button>
        ))}
      </div>
      <Field label="С">
        <Input type="date" value={value.from} max={value.to || todayInput()} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </Field>
      <Field label="По">
        <Input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </Field>
      <Field label="Клиент" className="min-w-40">
        <Select value={value.clientId} onChange={(e) => onChange({ ...value, clientId: e.target.value, projectId: "" })}>
          <option value="">Вся компания</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Проект" className="min-w-40">
        <Select value={value.projectId} onChange={(e) => onChange({ ...value, projectId: e.target.value })}>
          <option value="">Все проекты</option>
          {projects.filter((p) => !value.clientId || p.clientId === value.clientId).map((p) => (
            <option key={p.id} value={p.id}>{p.parentId ? `↳ ${p.name}` : p.name}</option>
          ))}
        </Select>
      </Field>
      {!isDefault && (
        <Button variant="ghost" icon={X} type="button" onClick={() => onChange(defaultReportFilters())}>
          Сбросить
        </Button>
      )}
    </FilterBar>
  );
}

/** Query-string params for /reports/* and /export/* from the filter values. */
export function reportParams(value: ReportFilterValues) {
  return {
    from: value.from || undefined,
    to: value.to || undefined,
    clientId: value.clientId || undefined,
    // A project scope is narrower than a client scope; send only the narrower one.
    projectId: value.projectId || undefined,
  };
}
