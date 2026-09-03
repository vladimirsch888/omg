import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { DictionaryType, DictionaryValue } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Field, IconButton, Input, Modal, PageHeader, StatusBadge, useUi } from "../../components/ui";

export function DictionariesPage() {
  const ui = useUi();
  const { isAdmin } = useAuth();
  const [types, setTypes] = useState<DictionaryType[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeCode, setTypeCode] = useState("");
  const [typeName, setTypeName] = useState("");
  const [valueDrafts, setValueDrafts] = useState<Record<string, { code: string; name: string }>>({});

  function load() {
    api.get<DictionaryType[]>("/dictionaries").then((res) => setTypes(res.data));
  }

  useEffect(load, []);

  async function createType(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/dictionaries", { code: typeCode, name: typeName });
      ui.toast("Раздел создан", "success");
      setTypeCode("");
      setTypeName("");
      setFormOpen(false);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось создать раздел"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function addValue(typeId: string) {
    const draft = valueDrafts[typeId];
    if (!draft?.code || !draft?.name) return;
    try {
      await api.post(`/dictionaries/${typeId}/values`, draft);
      setValueDrafts((prev) => ({ ...prev, [typeId]: { code: "", name: "" } }));
      ui.toast(`Добавлено «${draft.name}»`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось добавить значение"), "error");
    }
  }

  async function toggleValue(v: DictionaryValue) {
    try {
      await api.patch(`/dictionaries/values/${v.id}`, { isActive: !v.isActive });
      ui.toast(v.isActive ? `«${v.name}» отключено — в формах больше не предлагается` : `«${v.name}» включено`, "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось изменить значение"), "error");
    }
  }

  async function deleteValue(v: DictionaryValue) {
    const confirmed = await ui.confirm({
      title: `Удалить «${v.name}»?`,
      message: "Операции, проекты и заявки, где оно использовалось, останутся без этого значения. Если хотите просто убрать его из форм — отключите вместо удаления.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/dictionaries/values/${v.id}`);
      ui.toast("Значение удалено", "success");
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось удалить значение"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Справочники"
        description="Категории операций, типы проектов и заявок. Значения используются в формах по всему приложению."
        actions={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
              Новый раздел
            </Button>
          )
        }
      />

      {types.map((type) => (
        <Card
          key={type.id}
          title={
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{type.name}</span>
              <Badge>{type.code}</Badge>
              {type.isSystem && <Badge tone="accent">системный</Badge>}
            </span>
          }
        >
          <ul className="flex flex-col gap-1.5">
            {type.values.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-ink">{v.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-subtle">{v.code}</span>
                  {v.systemKey && <Badge tone="accent">служебное</Badge>}
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleValue(v)}
                    title={v.isActive ? "Отключить" : "Включить"}
                    className="-my-1.5 inline-flex min-h-11 cursor-pointer items-center py-1.5 sm:min-h-9"
                  >
                    <StatusBadge label={v.isActive ? "Активно" : "Отключено"} tone={v.isActive ? "income" : "neutral"} />
                  </button>
                  {isAdmin && !v.systemKey && (
                    <IconButton icon={Trash2} label="Удалить значение" onClick={() => deleteValue(v)} className="hover:text-expense" />
                  )}
                </span>
              </li>
            ))}
            {type.values.length === 0 && (
              <li className="py-3 text-center text-sm text-ink-subtle">В разделе пока нет значений</li>
            )}
          </ul>

          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row">
            <Input
              placeholder="код_значения"
              className="sm:max-w-48"
              value={valueDrafts[type.id]?.code ?? ""}
              onChange={(e) =>
                setValueDrafts((prev) => ({
                  ...prev,
                  [type.id]: { code: e.target.value, name: prev[type.id]?.name ?? "" },
                }))
              }
            />
            <Input
              placeholder="Название значения"
              value={valueDrafts[type.id]?.name ?? ""}
              onChange={(e) =>
                setValueDrafts((prev) => ({
                  ...prev,
                  [type.id]: { code: prev[type.id]?.code ?? "", name: e.target.value },
                }))
              }
            />
            <Button variant="secondary" icon={Plus} onClick={() => addValue(type.id)}>
              Добавить
            </Button>
          </div>
        </Card>
      ))}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Новый раздел справочника"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="dictionary-form" type="submit" loading={saving}>
              Создать
            </Button>
          </>
        }
      >
        <form id="dictionary-form" onSubmit={createType} className="flex flex-col gap-3.5 pb-2">
          <Field label="Код" hint="Латиницей, например my_section">
            <Input value={typeCode} onChange={(e) => setTypeCode(e.target.value)} required />
          </Field>
          <Field label="Название раздела">
            <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} required />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
