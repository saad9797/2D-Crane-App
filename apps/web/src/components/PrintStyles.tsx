import { GlobalStyles } from '@mui/material';

/** Print stylesheet: only the drawing sheet, full A3 landscape, no browser chrome. */
export function PrintStyles() {
  return (
    <GlobalStyles
      styles={{
        '@page': { size: 'A3 landscape', margin: 0 },
        '@media print': {
          '.no-print': { display: 'none !important' },
          'body *': { visibility: 'hidden' },
          '.print-sheet, .print-sheet *': { visibility: 'visible' },
          '.print-sheet': {
            position: 'fixed !important',
            left: '0 !important',
            top: '0 !important',
            width: '420mm !important',
            height: '297mm !important',
            transform: 'none !important',
            boxShadow: 'none !important',
            opacity: '1 !important',
          },
        },
      }}
    />
  );
}
