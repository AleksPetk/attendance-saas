/**
 * Stable KioskDesign font identifiers → self-hosted families.
 * Saved configs keep the same IDs. The picker only lists hosted faces.
 * open_sans / lato remain valid saved IDs and map onto hosted neighbors.
 */

export const KIOSK_FONTS = {
  inter: {
    label: "Inter",
    family: '"CS Inter", system-ui, sans-serif',
    picker: true,
  },
  roboto: {
    label: "Roboto",
    family: '"CS Roboto", system-ui, sans-serif',
    picker: true,
  },
  source_sans: {
    label: "Source Sans 3",
    family: '"CS Source Sans 3", system-ui, sans-serif',
    picker: true,
  },
  open_sans: {
    label: "Source Sans 3",
    family: '"CS Source Sans 3", system-ui, sans-serif',
    picker: false,
  },
  lato: {
    label: "Inter",
    family: '"CS Inter", system-ui, sans-serif',
    picker: false,
  },
  poppins: {
    label: "Poppins",
    family: '"CS Poppins", system-ui, sans-serif',
    picker: true,
  },
  nunito: {
    label: "Nunito",
    family: '"CS Nunito", system-ui, sans-serif',
    picker: true,
  },
  merriweather: {
    label: "Merriweather",
    family: '"CS Merriweather", Georgia, ui-serif, serif',
    picker: true,
  },
};

export function kioskFontFamily(identifier) {
  return (KIOSK_FONTS[identifier] || KIOSK_FONTS.inter).family;
}

export function kioskFontPickerIds() {
  return Object.keys(KIOSK_FONTS).filter((id) => KIOSK_FONTS[id].picker);
}

export function kioskFontPickerValue(identifier) {
  if (KIOSK_FONTS[identifier]?.picker) return identifier;
  if (identifier === "open_sans") return "source_sans";
  if (identifier === "lato") return "inter";
  return "inter";
}
