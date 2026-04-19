"use client";

import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
    AssistantConfigData,
    DisplayToolConfig,
    DisplayToolConfigItem
} from "@/components/assistant/assistant-types";

interface DisplayToolConfigProps {
  assistantConfigData: AssistantConfigData;
  setAssistantConfigData: React.Dispatch<React.SetStateAction<AssistantConfigData | null>>;
}

export default function DisplayToolConfigComponent({
  assistantConfigData,
  setAssistantConfigData,
}: DisplayToolConfigProps) {
  const [collapsedItems, setCollapsedItems] = useState<{ [key: string]: boolean }>({});

  const toggleItemCollapse = (itemId: string) => {
    setCollapsedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const currentDisplayConfig = assistantConfigData.displayToolConfig || { isEnabled: true, title: "Información Adicional", items: [] };

  const handleDisplayConfigChange = (newConfig: DisplayToolConfig) => {
    setAssistantConfigData(prev => prev ? ({ ...prev, displayToolConfig: newConfig }) : null);
  };

  const handleDisplayConfigSubChange = (field: keyof DisplayToolConfig, value: any) => {
    handleDisplayConfigChange({ ...currentDisplayConfig, [field]: value });
  };

  const displayTypeOptions: Array<{ value: DisplayToolConfigItem['displayType']; label: string }> = [
    { value: 'text', label: 'Texto' },
    { value: 'badge', label: 'Badge (Etiqueta)' },
    { value: 'progress', label: 'Barra de Progreso' },
    { value: 'currency', label: 'Moneda' },
    { value: 'list', label: 'Lista de Items' },
    { value: 'key_value_pairs', label: 'Pares Clave-Valor' },
  ];

  const badgeVariantOptions: Array<{ value: NonNullable<DisplayToolConfigItem['badgeVariant']>; label: string }> = [
    { value: 'default', label: 'Default' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'destructive', label: 'Destructive' },
    { value: 'outline', label: 'Outline' },
  ];

  const addDisplayConfigItem = () => {
    const newItem: DisplayToolConfigItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // Simple unique ID
      label: "Nuevo Item de Visualización",
      aiResponsePath: "",
      displayType: 'text',
      isVisible: true,
    };
    const updatedItems = [...(currentDisplayConfig.items || []), newItem];
    handleDisplayConfigSubChange('items', updatedItems);
  };

  const removeDisplayConfigItem = (itemIndex: number) => {
    const updatedItems = (currentDisplayConfig.items || []).filter((_, index) => index !== itemIndex);
    handleDisplayConfigSubChange('items', updatedItems);
  };

  const handleDisplayConfigItemChange = (itemIndex: number, field: keyof DisplayToolConfigItem, value: any) => {
    const updatedItems = (currentDisplayConfig.items || []).map((item, index) => {
      if (index === itemIndex) {
        return { ...item, [field]: value };
      }
      return item;
    });
    handleDisplayConfigSubChange('items', updatedItems);
  };

  return (
    <Card className="mt-4">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center space-x-2 pt-1">
          <Switch
            id="displayToolOverallEnabled"
            checked={currentDisplayConfig.isEnabled}
            onCheckedChange={(checked) => handleDisplayConfigSubChange('isEnabled', checked)}
          />
          <Label htmlFor="displayToolOverallEnabled">Habilitar Herramienta de Visualización en la Interfaz</Label>
        </div>
        <div>
          <Label htmlFor="displayToolOverallTitle">Título del Contenedor de Visualización</Label>
          <Input
            id="displayToolOverallTitle"
            value={currentDisplayConfig.title}
            onChange={(e) => handleDisplayConfigSubChange('title', e.target.value)}
            placeholder="Ej: Detalles del Pedido, Información Relevante"
          />
        </div>

        <div className="mt-4 pt-4 border-t">
          <Label className="text-md font-semibold block mb-3">Items de Visualización</Label>
          {(currentDisplayConfig.items || []).map((item, itemIndex) => (
            <Card key={item.id || `displayItem-${itemIndex}`} className="mt-3 bg-slate-50 dark:bg-slate-800/50 border-l-4 border-purple-500">
              <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => toggleItemCollapse(item.id)}>
                <p className="text-sm font-semibold">Item: {item.label || `Item #${itemIndex + 1}`}</p>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeDisplayConfigItem(itemIndex); }} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-1 h-auto">
                    {collapsedItems[item.id] ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
              {!collapsedItems[item.id] && (
                <div className="p-4 pt-0 space-y-3">
                  <div><Label htmlFor={`displayItem-label-${itemIndex}`}>Etiqueta (Label)</Label><Input id={`displayItem-label-${itemIndex}`} value={item.label} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'label', e.target.value)} placeholder="Ej: Estado del Pedido"/></div>
                  <div><Label htmlFor={`displayItem-aiResponsePath-${itemIndex}`}>Ruta en Datos (JSONPath)</Label><Input id={`displayItem-aiResponsePath-${itemIndex}`} value={item.aiResponsePath} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'aiResponsePath', e.target.value)} placeholder="Ej: order.status o data.user.name"/></div>
                  <div className="flex items-center space-x-2 pt-1"><Switch id={`displayItem-isVisible-${itemIndex}`} checked={item.isVisible} onCheckedChange={(checked) => handleDisplayConfigItemChange(itemIndex, 'isVisible', checked)} /><Label htmlFor={`displayItem-isVisible-${itemIndex}`}>¿Visible por defecto?</Label></div>

                  <div><Label htmlFor={`displayItem-displayType-${itemIndex}`}>Tipo de Visualización</Label>
                    <Select value={item.displayType} onValueChange={(val) => handleDisplayConfigItemChange(itemIndex, 'displayType', val as DisplayToolConfigItem['displayType'])}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                      <SelectContent>{displayTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {item.displayType === 'badge' && (
                    <div><Label htmlFor={`displayItem-badgeVariant-${itemIndex}`}>Variante del Badge</Label>
                      <Select value={item.badgeVariant || 'default'} onValueChange={(val) => handleDisplayConfigItemChange(itemIndex, 'badgeVariant', val as NonNullable<DisplayToolConfigItem['badgeVariant']>)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{badgeVariantOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}

                  {item.displayType === 'progress' && (
                    <div><Label htmlFor={`displayItem-progressValuePath-${itemIndex}`}>Ruta para Valor de Progreso (0-100)</Label><Input id={`displayItem-progressValuePath-${itemIndex}`} value={item.progressValuePath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'progressValuePath', e.target.value)} placeholder="Ej: order.completionPercentage"/></div>
                  )}

                  {item.displayType === 'list' && (
                    <>
                      <div><Label htmlFor={`displayItem-listItemsPath-${itemIndex}`}>Ruta para Array de Items de Lista</Label><Input id={`displayItem-listItemsPath-${itemIndex}`} value={item.listItemsPath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'listItemsPath', e.target.value)} placeholder="Ej: order.items"/></div>
                      <div><Label htmlFor={`displayItem-listItemNamePath-${itemIndex}`}>Ruta para Nombre en Item de Lista</Label><Input id={`displayItem-listItemNamePath-${itemIndex}`} value={item.listItemNamePath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'listItemNamePath', e.target.value)} placeholder="Ej: name o product.title"/></div>
                      <div><Label htmlFor={`displayItem-listItemValuePath-${itemIndex}`}>Ruta para Valor en Item de Lista (Opcional)</Label><Input id={`displayItem-listItemValuePath-${itemIndex}`} value={item.listItemValuePath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'listItemValuePath', e.target.value)} placeholder="Ej: quantity o price"/></div>
                      <div><Label htmlFor={`displayItem-listItemSubTextPath-${itemIndex}`}>Ruta para Subtexto en Item de Lista (Opcional)</Label><Input id={`displayItem-listItemSubTextPath-${itemIndex}`} value={item.listItemSubTextPath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'listItemSubTextPath', e.target.value)} placeholder="Ej: sku o details.color"/></div>
                    </>
                  )}

                  {item.displayType === 'key_value_pairs' && (
                    <div><Label htmlFor={`displayItem-keyValuePairsPath-${itemIndex}`}>Ruta para Objeto/Array de Pares Clave-Valor</Label><Input id={`displayItem-keyValuePairsPath-${itemIndex}`} value={item.keyValuePairsPath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'keyValuePairsPath', e.target.value)} placeholder="Ej: order.details o user.metadata"/></div>
                  )}

                  <div className="mt-2 space-y-1 pt-2 border-t border-dashed">
                      <Label className="text-xs font-medium">Condiciones de Visibilidad (Opcional)</Label>
                      <div><Label htmlFor={`displayItem-trueConditionPath-${itemIndex}`} className="text-xs">Mostrar si esta ruta de datos es &apos;true&apos; (o existe y no es false/null/undefined)</Label><Input id={`displayItem-trueConditionPath-${itemIndex}`} value={item.trueConditionPath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'trueConditionPath', e.target.value)} placeholder="Ej: order.isActive"/></div>
                      <div><Label htmlFor={`displayItem-falseConditionPath-${itemIndex}`} className="text-xs">Mostrar si esta ruta de datos es &apos;false&apos; (o no existe / es null/undefined)</Label><Input id={`displayItem-falseConditionPath-${itemIndex}`} value={item.falseConditionPath || ""} onChange={(e) => handleDisplayConfigItemChange(itemIndex, 'falseConditionPath', e.target.value)} placeholder="Ej: order.isCancelled"/></div>
                  </div>
                </div>
              )}
            </Card>
          ))}
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={addDisplayConfigItem}>
            Añadir Item de Visualización
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}