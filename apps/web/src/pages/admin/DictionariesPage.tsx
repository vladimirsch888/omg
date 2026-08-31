import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { DictionaryType } from "../../api/types";
import { Card } from "../../components/Card";

export function DictionariesPage() {
  const [types, setTypes] = useState<DictionaryType[]>([]);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeCode, setTypeCode] = useState("");
  const [typeName, setTypeName] = useState("");

  const [valueDrafts, setValueDrafts] = useState<Record<string, { code: string; name: string }>>({});

  function load() {
    api.get<DictionaryType[]>("/dictionaries").then((res) => setTypes(res.data));
  }

  useEffect(load, []);

  async function createType(e: FormEvent) {
    e.preventDefault();
    await api.post("/dictionaries", { code: typeCode, name: typeName });
    setTypeCode("");
    setTypeName("");
    setShowTypeForm(false);
    load();
  }

  async function addValue(typeId: string) {
    const draft = valueDrafts[typeId];
    if (!draft?.code || !draft?.name) return;
    await api.post(`/dictionaries/${typeId}/values`, draft);
    setValueDrafts((prev) => ({ ...prev, [typeId]: { code: "", name: "" } }));
    load();
  }

  async function toggleValue(id: string, isActive: boolean) {
    await api.patch(`/dictionaries/values/${id}`, { isActive: !isActive });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Справочники</h1>
        <button onClick={() => setShowTypeForm(!showTypeForm)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {showTypeForm ? "Отмена" : "+ Новый раздел справочника"}
        </button>
      </div>

      {showTypeForm && (
        <Card>
          <form onSubmit={createType} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Код (например my_section)" value={typeCode} onChange={(e) => setTypeCode(e.target.value)} required />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Название раздела" value={typeName} onChange={(e) => setTypeName(e.target.value)} required />
            <button type="submit" className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Создать раздел
            </button>
          </form>
        </Card>
      )}

      {types.map((type) => (
        <Card key={type.id} title={`${type.name} (${type.code})${type.isSystem ? " · системный" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Код</th>
                <th className="py-2">Название</th>
                <th className="py-2">Активно</th>
              </tr>
            </thead>
            <tbody>
              {type.values.map((v) => (
                <tr key={v.id} className="border-b border-slate-100">
                  <td className="py-2">{v.code}</td>
                  <td className="py-2">{v.name}</td>
                  <td className="py-2">
                    <button onClick={() => toggleValue(v.id, v.isActive)} className={`rounded px-2 py-1 text-xs ${v.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {v.isActive ? "Да" : "Нет"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="код_значения"
              value={valueDrafts[type.id]?.code ?? ""}
              onChange={(e) => setValueDrafts((prev) => ({ ...prev, [type.id]: { ...prev[type.id], code: e.target.value, name: prev[type.id]?.name ?? "" } }))}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Название значения"
              value={valueDrafts[type.id]?.name ?? ""}
              onChange={(e) => setValueDrafts((prev) => ({ ...prev, [type.id]: { ...prev[type.id], name: e.target.value, code: prev[type.id]?.code ?? "" } }))}
            />
            <button onClick={() => addValue(type.id)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              + Добавить значение
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
