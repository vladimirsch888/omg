import { FormEvent, useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { DictionaryType, LicenseProduct } from "../api/types";
import {
  Badge,
  Button,
  ListCard,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetaItem,
  Modal,
  PageHeader,
  RowCard,
  Select,
  StatusBadge,
  useUi,
} from "../components/ui";
import { formatMoney } from "../utils/format";

const emptyForm = {
  name: "",
  type: "LICENSE" as LicenseProduct["type"],
  categoryValueId: "",
  defaultPrice: "",
  defaultDurationMonths: "1",
  defaultWorkDays: "",
  defaultVendorSharePercent: "50",
  defaultTaxable: true,
};

function termLabel(p: LicenseProduct): string {
  if (p.type === "WORK") return p.defaultWorkDays ? `~${p.defaultWorkDays} раб. дн.` : "разовая работа";
  return `${p.defaultDurationMonths} мес.`;
}

export function ProductsPage() {
  const ui = useUi();
  const [products, setProducts] = useState<LicenseProduct[]>([]);
  const [categories, setCategories] = useState<DictionaryType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api
      .get<LicenseProduct[]>("/license-products", { params: { includeInactive: true } })
      .then((res) => setProducts(res.data));
  }

  useEffect(() => {
    load();
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      setCategories(res.data.find((d) => d.code === "operation_category") ?? null);
    });
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(p: LicenseProduct) {
    setForm({
      name: p.name,
      type: p.type,
      categoryValueId: p.categoryValueId ?? "",
      defaultPrice: String(p.defaultPrice),
      defaultDurationMonths: p.defaultDurationMonths != null ? String(p.defaultDurationMonths) : "1",
      defaultWorkDays: p.defaultWorkDays != null ? String(p.defaultWorkDays) : "",
      defaultVendorSharePercent: String(p.defaultVendorSharePercent),
      defaultTaxable: p.defaultTaxable,
    });
    setEditingId(p.id);
    setFormOpen(true);
  }

  function onSelectType(type: LicenseProduct["type"]) {
    setForm({ ...form, type, defaultVendorSharePercent: type === "WORK" ? "0" : form.defaultVendorSharePercent });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      type: form.type,
      categoryValueId: form.categoryValueId || undefined,
      defaultPrice: Number(form.defaultPrice),
      defaultDurationMonths: form.type === "LICENSE" ? Number(form.defaultDurationMonths) : undefined,
      defaultWorkDays: form.type === "WORK" && form.defaultWorkDays ? Number(form.defaultWorkDays) : undefined,
      defaultVendorSharePercent: Number(form.defaultVendorSharePercent),
      defaultTaxable: form.defaultTaxable,
    };
    try {
      if (editingId) {
        await api.patch(`/license-products/${editingId}`, payload);
        ui.toast("Продукт обновлён", "success");
      } else {
        await api.post("/license-products", payload);
        ui.toast("Продукт добавлен", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось сохранить продукт", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/license-products/${id}`, { isActive: !isActive });
    load();
  }

  async function handleDelete(p: LicenseProduct) {
    const confirmed = await ui.confirm({
      title: `Удалить продукт «${p.name}»?`,
      message: "Если по нему уже есть продажи или подписки, удаление будет отклонено — деактивируйте продукт вместо удаления.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/license-products/${p.id}`);
      ui.toast("Продукт удалён", "success");
      load();
    } catch (err: any) {
      ui.toast(err.response?.data?.error ?? "Не удалось удалить продукт", "error");
    }
  }

  const columns: Column<LicenseProduct>[] = [
    {
      key: "name",
      header: "Название",
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{p.name}</span>
          <Badge tone={p.type === "WORK" ? "accent" : "neutral"}>{p.type === "WORK" ? "работа" : "лицензия"}</Badge>
        </div>
      ),
    },
    {
      key: "category",
      header: "Категория",
      hideBelow: "lg",
      render: (p) => <span className="text-ink-muted">{p.categoryValue?.name ?? "—"}</span>,
    },
    {
      key: "price",
      header: "Цена",
      align: "right",
      render: (p) => <span className="font-medium text-ink">{formatMoney(p.defaultPrice)}</span>,
    },
    { key: "term", header: "Срок", align: "right", hideBelow: "md", render: (p) => <span className="text-ink-muted">{termLabel(p)}</span> },
    {
      key: "vendor",
      header: "Вендору",
      align: "right",
      hideBelow: "md",
      render: (p) => <span className="text-ink-muted">{String(p.defaultVendorSharePercent)}%</span>,
    },
    {
      key: "active",
      header: "Активен",
      render: (p) => (
        <button onClick={() => toggleActive(p.id, p.isActive)} className="cursor-pointer">
          <StatusBadge label={p.isActive ? "Да" : "Нет"} tone={p.isActive ? "income" : "neutral"} />
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Редактировать" onClick={() => startEdit(p)} />
          <IconButton icon={Trash2} label="Удалить" onClick={() => handleDelete(p)} className="hover:text-expense" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Продукты"
        description="Товарная матрица: цена, срок, доля вендора и налогообложение. Эти значения подставляются при создании продажи или подписки."
        actions={
          <Button variant="primary" icon={Plus} onClick={startCreate}>
            Новый продукт
          </Button>
        }
      />

      <ListCard>
        <DataTable
          rows={products}
          columns={columns}
          getRowKey={(p) => p.id}
          renderCard={(p) => (
            <RowCard
              title={p.name}
              subtitle={p.categoryValue?.name}
              value={formatMoney(p.defaultPrice)}
              meta={
                <>
                  <Badge tone={p.type === "WORK" ? "accent" : "neutral"}>{p.type === "WORK" ? "работа" : "лицензия"}</Badge>
                  <MetaItem label="Срок">{termLabel(p)}</MetaItem>
                  <MetaItem label="Вендору">{String(p.defaultVendorSharePercent)}%</MetaItem>
                  <StatusBadge label={p.isActive ? "Активен" : "Отключён"} tone={p.isActive ? "income" : "neutral"} />
                </>
              }
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(p.id, p.isActive)}>
                    {p.isActive ? "Отключить" : "Включить"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(p)}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(p)}>
                    Удалить
                  </Button>
                </>
              }
            />
          )}
          empty={
            <EmptyState
              icon={Package}
              title="Продуктов пока нет"
              description="Добавьте лицензии и работы, которые вы продаёте — они станут шаблонами для продаж и подписок."
              action={
                <Button variant="primary" icon={Plus} onClick={startCreate}>
                  Новый продукт
                </Button>
              }
            />
          }
        />
      </ListCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "Редактирование продукта" : "Новый продукт"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" form="product-form" type="submit" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
          <Field label="Название" className="sm:col-span-2">
            <Input
              placeholder="Например: amoCRM Professional, 10 мест"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>

          <Field label="Тип">
            <Select value={form.type} onChange={(e) => onSelectType(e.target.value as LicenseProduct["type"])}>
              <option value="LICENSE">Лицензия (по подписке)</option>
              <option value="WORK">Работа (разовая, без подписки)</option>
            </Select>
          </Field>

          <Field label="Категория операций">
            <Select value={form.categoryValueId} onChange={(e) => setForm({ ...form, categoryValueId: e.target.value })}>
              <option value="">Без категории</option>
              {categories?.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Цена по умолчанию">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.defaultPrice}
              onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
              required
            />
          </Field>

          {form.type === "LICENSE" ? (
            <Field label="Срок подписки, мес.">
              <Input
                type="number"
                min="1"
                inputMode="numeric"
                value={form.defaultDurationMonths}
                onChange={(e) => setForm({ ...form, defaultDurationMonths: e.target.value })}
                required
              />
            </Field>
          ) : (
            <Field label="Срок выполнения, раб. дней" hint="Необязательно — подставится в продажу">
              <Input
                type="number"
                min="1"
                inputMode="numeric"
                value={form.defaultWorkDays}
                onChange={(e) => setForm({ ...form, defaultWorkDays: e.target.value })}
              />
            </Field>
          )}

          <Field label="Доля вендора, %">
            <Input
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              value={form.defaultVendorSharePercent}
              onChange={(e) => setForm({ ...form, defaultVendorSharePercent: e.target.value })}
              required
            />
          </Field>

          <div className="flex items-end pb-2.5">
            <Checkbox
              label="Облагается налогом"
              checked={form.defaultTaxable}
              onChange={(e) => setForm({ ...form, defaultTaxable: e.target.checked })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
