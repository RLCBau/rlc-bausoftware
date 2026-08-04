# RLC Enterprise AI — third-party notices

RLC Enterprise AI can run the following separately distributed components:

- **Ollama** — see the license distributed by the Ollama project and the
  corresponding container image.
- **Qwen3.5 2B Q4_K_M** — see the model card and Apache-2.0 license files
  distributed with the exact model downloaded by Ollama.

The installation script downloads these components from their respective
publishers. Keep their original license and notice files with every commercial
customer installation. This notice does not replace those upstream licenses.

RLC must not expose Ollama's port `11434` to the public internet. The supplied
Docker overlay only exposes it to the internal Compose network.
