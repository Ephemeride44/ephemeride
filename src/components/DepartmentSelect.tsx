"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DEPARTMENTS, formatDepartment } from "@/lib/departments";

interface DepartmentSelectProps {
  /** Code du département sélectionné (ex : "44"). Vide si aucun. */
  value: string;
  /** Appelé avec le code du département choisi. */
  onChange: (code: string) => void;
  /** Thème courant pour harmoniser les couleurs avec le formulaire. */
  theme?: "light" | "dark";
  /** Affiche une bordure rouge si le champ est en erreur. */
  hasError?: boolean;
  id?: string;
}

/**
 * Sélecteur de département recherchable : on filtre la liste en tapant soit le
 * numéro, soit le nom du département. La valeur stockée reste le code INSEE
 * (ex : "44") pour rester compatible avec les données et le filtre existants.
 */
const DepartmentSelect = ({
  value,
  onChange,
  theme = "dark",
  hasError,
  id,
}: DepartmentSelectProps) => {
  const [open, setOpen] = useState(false);
  const isLight = theme === "light";

  const fieldClass = isLight
    ? "border-[#f3e0c7] bg-white text-[#1B263B] hover:bg-white hover:text-[#1B263B]"
    : "border-white/20 bg-white/10 text-white hover:bg-white/10 hover:text-white";

  return (
    // modal : la liste est rendue dans un portail, hors de la modale de
    // proposition ; sans ça, le verrou de scroll du Dialog bloque la molette.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            fieldClass,
            hasError && "border-red-500 focus:border-red-500",
            !value && (isLight ? "text-[#1B263B]/50" : "text-white/50"),
          )}
        >
          {value ? formatDepartment(value) : "Choisir un département"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* z-[80] : la liste doit passer au-dessus de la modale de proposition
          d'événement (DialogContent en z-[70] sur la home). */}
      <PopoverContent className="z-[80] w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Numéro ou nom du département…" />
          <CommandList>
            <CommandEmpty>Aucun département trouvé.</CommandEmpty>
            <CommandGroup>
              {DEPARTMENTS.map((dept) => (
                <CommandItem
                  key={dept.code}
                  // La valeur sert au filtrage cmdk : on y met code + nom pour
                  // pouvoir chercher indifféremment par numéro ou par libellé.
                  value={`${dept.code} ${dept.name}`}
                  onSelect={() => {
                    onChange(dept.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === dept.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {dept.code} — {dept.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default DepartmentSelect;