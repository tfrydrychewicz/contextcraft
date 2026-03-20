import { createContext } from 'slotmux';

const { config } = createContext({
  model: 'gpt-5.4-mini',
  preset: 'chat',
  /** Skip peer resolution in minimal doc snippets; apps should use default true. */
  strictTokenizerPeers: false,
});

void config;
