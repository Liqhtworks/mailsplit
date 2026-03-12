import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface VariantInput {
  label: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
}

export function CreateTest() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [variants, setVariants] = useState<VariantInput[]>([
    { label: "Variant A", subject: "", preheader: "", bodyHtml: "" },
    { label: "Variant B", subject: "", preheader: "", bodyHtml: "" },
  ]);
  const [split, setSplit] = useState([50, 50]);
  const [isCreating, setIsCreating] = useState(false);

  const addVariant = () => {
    if (variants.length >= 5) return;
    const letter = String.fromCharCode(65 + variants.length);
    setVariants([...variants, { label: `Variant ${letter}`, subject: "", preheader: "", bodyHtml: "" }]);
    const newSplit = Array(variants.length + 1).fill(Math.floor(100 / (variants.length + 1)));
    newSplit[newSplit.length - 1] = 100 - newSplit.slice(0, -1).reduce((a: number, b: number) => a + b, 0);
    setSplit(newSplit);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    const newVariants = variants.filter((_, i) => i !== index);
    setVariants(newVariants);
    const newSplit = Array(newVariants.length).fill(Math.floor(100 / newVariants.length));
    newSplit[newSplit.length - 1] = 100 - newSplit.slice(0, -1).reduce((a: number, b: number) => a + b, 0);
    setSplit(newSplit);
  };

  const updateVariant = (index: number, field: keyof VariantInput, value: string) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);

    try {
      const test = await api.createTest({ name, trafficSplit: split });

      for (const variant of variants) {
        await api.addVariant(test.id, variant);
      }

      navigate(`/tests/${test.id}`);
    } catch (err: any) {
      alert(err.message);
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/")}
        className="text-sm text-sand-11 hover:text-sand-12 mb-4 flex items-center gap-1"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold text-sand-12 mb-8">Create A/B Test</h1>

      <form onSubmit={handleSubmit}>
        {/* Test Name */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-sand-12 mb-2">Test Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Spring Sale Subject Line Test"
            className="w-full px-4 py-2.5 rounded-lg border border-sand-5 bg-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none transition-colors"
            required
          />
        </div>

        {/* Traffic Split */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-sand-12 mb-2">Traffic Split</label>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-2">
            {split.map((pct, i) => (
              <div
                key={i}
                style={{ width: `${pct}%`, backgroundColor: ["#AD8B00", "#4A9B6E", "#6366F1", "#D4954A", "#C45C5C"][i] }}
                className="transition-all"
              />
            ))}
          </div>
          <div className="flex gap-2 text-sm text-sand-11">
            {split.map((pct, i) => (
              <span key={i}>{variants[i]?.label}: {pct}%</span>
            ))}
          </div>
        </div>

        {/* Variants */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-sand-12">
              Variants ({variants.length}/5)
            </label>
            {variants.length < 5 && (
              <button
                type="button"
                onClick={addVariant}
                className="text-sm text-gold-700 hover:text-gold-800 font-medium"
              >
                + Add Variant
              </button>
            )}
          </div>

          <div className="space-y-4">
            {variants.map((variant, i) => (
              <div key={i} className="bg-white rounded-xl border border-sand-5 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: ["#AD8B00", "#4A9B6E", "#6366F1", "#D4954A", "#C45C5C"][i] }}
                    />
                    <input
                      type="text"
                      value={variant.label}
                      onChange={(e) => updateVariant(i, "label", e.target.value)}
                      className="font-medium text-sand-12 bg-transparent border-none outline-none"
                    />
                  </div>
                  {variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="text-sand-8 hover:text-red-500 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-sand-11 mb-1">
                      Subject Line
                      <span className="ml-2 text-sand-8">{variant.subject.length}/80</span>
                    </label>
                    <input
                      type="text"
                      value={variant.subject}
                      onChange={(e) => updateVariant(i, "subject", e.target.value)}
                      placeholder="Enter subject line..."
                      className="w-full px-3 py-2 rounded-md border border-sand-5 text-sm focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sand-11 mb-1">
                      Preheader
                      <span className="ml-2 text-sand-8">{variant.preheader.length}/120</span>
                    </label>
                    <input
                      type="text"
                      value={variant.preheader}
                      onChange={(e) => updateVariant(i, "preheader", e.target.value)}
                      placeholder="Preview text..."
                      className="w-full px-3 py-2 rounded-md border border-sand-5 text-sm focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sand-11 mb-1">Body (HTML)</label>
                    <textarea
                      value={variant.bodyHtml}
                      onChange={(e) => updateVariant(i, "bodyHtml", e.target.value)}
                      placeholder="<h1>Hello {{first_name}}</h1>..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-md border border-sand-5 text-sm font-mono focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none resize-y"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="px-6 py-2.5 rounded-lg bg-gold-700 text-white font-medium hover:bg-gold-800 transition-colors disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Test"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-6 py-2.5 rounded-lg border border-sand-5 text-sand-11 font-medium hover:bg-sand-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
