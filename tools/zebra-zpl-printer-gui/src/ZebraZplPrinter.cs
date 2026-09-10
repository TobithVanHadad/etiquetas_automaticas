using System;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace ZebraZplPrinterGui
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args.FirstOrDefault()));
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly TextBox fileTextBox = new TextBox();
        private readonly ComboBox printerComboBox = new ComboBox();
        private readonly NumericUpDown copiesInput = new NumericUpDown();
        private readonly Label statusLabel = new Label();
        private readonly string configPath;

        public MainForm(string initialFile)
        {
            Text = "Zebra ZPL Printer";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(620, 360);
            Size = new Size(720, 390);
            Font = new Font("Segoe UI", 10f);
            BackColor = Color.White;
            AllowDrop = true;

            configPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ZebraZplPrintAgent",
                "printer-gui.config"
            );

            BuildLayout();
            LoadPrinters();
            LoadConfig();

            if (!string.IsNullOrWhiteSpace(initialFile) && File.Exists(initialFile))
            {
                fileTextBox.Text = initialFile;
            }

            DragEnter += OnDragEnter;
            DragDrop += OnDragDrop;
        }

        private void BuildLayout()
        {
            var titleLabel = new Label
            {
                Text = "Imprimir archivo ZPL",
                Font = new Font(Font.FontFamily, 16f, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(24, 22)
            };
            Controls.Add(titleLabel);

            var hintLabel = new Label
            {
                Text = "Selecciona el archivo .zpl y la impresora Zebra instalada en este equipo.",
                AutoSize = true,
                ForeColor = Color.FromArgb(80, 80, 80),
                Location = new Point(26, 58)
            };
            Controls.Add(hintLabel);

            var fileLabel = new Label
            {
                Text = "Archivo ZPL",
                AutoSize = true,
                Location = new Point(26, 100)
            };
            Controls.Add(fileLabel);

            fileTextBox.Location = new Point(28, 126);
            fileTextBox.Size = new Size(510, 30);
            fileTextBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(fileTextBox);

            var browseButton = new Button
            {
                Text = "Buscar...",
                Location = new Point(552, 124),
                Size = new Size(128, 34),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            browseButton.Click += delegate { BrowseFile(); };
            Controls.Add(browseButton);

            var printerLabel = new Label
            {
                Text = "Impresora",
                AutoSize = true,
                Location = new Point(26, 180)
            };
            Controls.Add(printerLabel);

            printerComboBox.Location = new Point(28, 206);
            printerComboBox.Size = new Size(390, 30);
            printerComboBox.DropDownStyle = ComboBoxStyle.DropDown;
            printerComboBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(printerComboBox);

            var refreshButton = new Button
            {
                Text = "Actualizar",
                Location = new Point(430, 204),
                Size = new Size(108, 34),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            refreshButton.Click += delegate { LoadPrinters(); };
            Controls.Add(refreshButton);

            var copiesLabel = new Label
            {
                Text = "Copias",
                AutoSize = true,
                Location = new Point(552, 180),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            Controls.Add(copiesLabel);

            copiesInput.Location = new Point(554, 206);
            copiesInput.Size = new Size(126, 30);
            copiesInput.Minimum = 1;
            copiesInput.Maximum = 999;
            copiesInput.Value = 1;
            copiesInput.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            Controls.Add(copiesInput);

            var printButton = new Button
            {
                Text = "Imprimir ZPL",
                Location = new Point(28, 268),
                Size = new Size(160, 44),
                BackColor = Color.FromArgb(0, 112, 84),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            printButton.FlatAppearance.BorderSize = 0;
            printButton.Click += delegate { PrintSelectedFile(); };
            Controls.Add(printButton);

            var testButton = new Button
            {
                Text = "Usar prueba",
                Location = new Point(200, 268),
                Size = new Size(120, 44)
            };
            testButton.Click += delegate { SelectBundledTestLabel(); };
            Controls.Add(testButton);

            var fontsButton = new Button
            {
                Text = "Listar fuentes",
                Location = new Point(332, 268),
                Size = new Size(136, 44)
            };
            fontsButton.Click += delegate { PrintFontDirectory(); };
            Controls.Add(fontsButton);

            statusLabel.Location = new Point(28, 326);
            statusLabel.Size = new Size(650, 28);
            statusLabel.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            statusLabel.ForeColor = Color.FromArgb(70, 70, 70);
            statusLabel.Text = "Listo.";
            Controls.Add(statusLabel);
        }

        private void BrowseFile()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Title = "Seleccionar archivo ZPL";
                dialog.Filter = "Archivos ZPL (*.zpl)|*.zpl|Todos los archivos (*.*)|*.*";
                dialog.CheckFileExists = true;

                if (File.Exists(fileTextBox.Text))
                {
                    dialog.InitialDirectory = Path.GetDirectoryName(fileTextBox.Text);
                }

                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    fileTextBox.Text = dialog.FileName;
                    statusLabel.Text = "Archivo seleccionado.";
                }
            }
        }

        private void LoadPrinters()
        {
            var previous = printerComboBox.Text;
            printerComboBox.Items.Clear();

            foreach (string printer in PrinterSettings.InstalledPrinters)
            {
                printerComboBox.Items.Add(printer);
            }

            if (!string.IsNullOrWhiteSpace(previous))
            {
                printerComboBox.Text = previous;
            }
            else if (printerComboBox.Items.Count > 0)
            {
                var zebra = printerComboBox.Items
                    .Cast<string>()
                    .FirstOrDefault(p => p.IndexOf("zebra", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         p.IndexOf("zdesigner", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         p.IndexOf("zt610", StringComparison.OrdinalIgnoreCase) >= 0);
                printerComboBox.Text = zebra ?? printerComboBox.Items[0].ToString();
            }

            statusLabel.Text = printerComboBox.Items.Count == 0
                ? "No se detectaron impresoras. Puedes escribir el nombre manualmente."
                : "Impresoras cargadas.";
        }

        private void LoadConfig()
        {
            try
            {
                if (!File.Exists(configPath))
                {
                    return;
                }

                var lines = File.ReadAllLines(configPath, Encoding.UTF8);
                if (lines.Length > 0 && !string.IsNullOrWhiteSpace(lines[0]))
                {
                    printerComboBox.Text = lines[0];
                }
                if (lines.Length > 1 && Directory.Exists(lines[1]))
                {
                    fileTextBox.Text = "";
                }
            }
            catch
            {
                // Config is optional. Ignore unreadable files.
            }
        }

        private void SaveConfig()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(configPath));
                var folder = File.Exists(fileTextBox.Text)
                    ? Path.GetDirectoryName(fileTextBox.Text)
                    : string.Empty;
                File.WriteAllLines(configPath, new[] { printerComboBox.Text, folder ?? string.Empty }, Encoding.UTF8);
            }
            catch
            {
                // Non-critical.
            }
        }

        private void PrintSelectedFile()
        {
            var path = fileTextBox.Text.Trim().Trim('"');
            var printerName = printerComboBox.Text.Trim();

            if (!File.Exists(path))
            {
                MessageBox.Show(this, "Selecciona un archivo .zpl valido.", "Archivo faltante", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (string.IsNullOrWhiteSpace(printerName))
            {
                MessageBox.Show(this, "Selecciona o escribe el nombre de la impresora.", "Impresora faltante", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!Path.GetExtension(path).Equals(".zpl", StringComparison.OrdinalIgnoreCase))
            {
                var result = MessageBox.Show(
                    this,
                    "El archivo no termina en .zpl. ¿Quieres enviarlo de todos modos?",
                    "Confirmar impresion",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );

                if (result != DialogResult.Yes)
                {
                    return;
                }
            }

            try
            {
                Cursor = Cursors.WaitCursor;
                statusLabel.Text = "Enviando a impresora...";
                Application.DoEvents();

                var copies = (int)copiesInput.Value;
                for (var i = 0; i < copies; i++)
                {
                    RawPrinter.SendFile(printerName, path);
                }

                SaveConfig();
                statusLabel.Text = "Impresion enviada correctamente.";
                MessageBox.Show(this, "ZPL enviado a la impresora.", "Listo", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                statusLabel.Text = "Error al imprimir.";
                MessageBox.Show(this, ex.Message, "Error de impresion", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private void SelectBundledTestLabel()
        {
            var appDir = AppDomain.CurrentDomain.BaseDirectory;
            var testPath = Path.Combine(appDir, "test-label.zpl");

            if (!File.Exists(testPath))
            {
                MessageBox.Show(this, "No encontre test-label.zpl junto al programa.", "Prueba no encontrada", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            fileTextBox.Text = testPath;
            statusLabel.Text = "Etiqueta de prueba seleccionada.";
        }

        private void PrintFontDirectory()
        {
            var printerName = printerComboBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(printerName))
            {
                MessageBox.Show(this, "Selecciona o escribe el nombre de la impresora.", "Impresora faltante", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var result = MessageBox.Show(
                this,
                "Esto imprime etiquetas de diagnostico con fuentes y archivos cargados en la Zebra. ¿Quieres enviarlo ahora?",
                "Listar fuentes de la impresora",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (result != DialogResult.Yes)
            {
                return;
            }

            try
            {
                Cursor = Cursors.WaitCursor;
                statusLabel.Text = "Solicitando listado de fuentes...";
                Application.DoEvents();

                RawPrinter.SendText(printerName, "zebra-font-directory.zpl", BuildFontDirectoryZpl());

                SaveConfig();
                statusLabel.Text = "Listado enviado. Revisa las etiquetas impresas.";
                MessageBox.Show(this, "La Zebra debe imprimir sus directorios de fuentes/archivos. Usa nombres .TTF, .TTE, .OTF o .FNT encontrados ahi.", "Listo", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                statusLabel.Text = "Error al listar fuentes.";
                MessageBox.Show(this, ex.Message, "Error de impresion", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private static string BuildFontDirectoryZpl()
        {
            return string.Join("\r\n", new[]
            {
                "^XA^WDZ:*.FNT^XZ",
                "^XA^WDZ:*.TTF^XZ",
                "^XA^WDZ:*.TTE^XZ",
                "^XA^WDZ:*.OTF^XZ",
                "^XA^WDE:*.*^XZ",
                "^XA^WDR:*.*^XZ",
                "^XA^WDB:*.*^XZ"
            });
        }

        private void OnDragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effect = DragDropEffects.Copy;
            }
        }

        private void OnDragDrop(object sender, DragEventArgs e)
        {
            var files = e.Data.GetData(DataFormats.FileDrop) as string[];
            if (files != null && files.Length > 0)
            {
                fileTextBox.Text = files[0];
                statusLabel.Text = "Archivo cargado desde arrastrar y soltar.";
            }
        }
    }

    internal static class RawPrinter
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private sealed class DocInfo
        {
            [MarshalAs(UnmanagedType.LPStr)]
            public string DocumentName;
            [MarshalAs(UnmanagedType.LPStr)]
            public string OutputFile;
            [MarshalAs(UnmanagedType.LPStr)]
            public string DataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool ClosePrinter(IntPtr printerHandle);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool StartDocPrinter(IntPtr printerHandle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DocInfo docInfo);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool EndDocPrinter(IntPtr printerHandle);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool StartPagePrinter(IntPtr printerHandle);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool EndPagePrinter(IntPtr printerHandle);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern bool WritePrinter(IntPtr printerHandle, IntPtr bytes, int byteCount, out int bytesWritten);

        public static void SendFile(string printerName, string filePath)
        {
            var bytes = File.ReadAllBytes(filePath);
            SendBytes(printerName, Path.GetFileName(filePath), bytes);
        }

        public static void SendText(string printerName, string documentName, string text)
        {
            SendBytes(printerName, documentName, Encoding.UTF8.GetBytes(text));
        }

        private static void SendBytes(string printerName, string documentName, byte[] bytes)
        {
            IntPtr printerHandle;
            if (!OpenPrinter(printerName.Normalize(), out printerHandle, IntPtr.Zero))
            {
                ThrowWin32("No pude abrir la impresora: " + printerName);
            }

            var unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

            try
            {
                var docInfo = new DocInfo
                {
                    DocumentName = documentName,
                    DataType = "RAW"
                };

                if (!StartDocPrinter(printerHandle, 1, docInfo))
                {
                    ThrowWin32("Windows no acepto iniciar el trabajo de impresion.");
                }
                try
                {
                    if (!StartPagePrinter(printerHandle))
                    {
                        ThrowWin32("Windows no acepto iniciar la pagina de impresion.");
                    }
                    try
                    {
                        int written;
                        if (!WritePrinter(printerHandle, unmanagedBytes, bytes.Length, out written) || written != bytes.Length)
                        {
                            ThrowWin32("Windows no acepto escribir el ZPL completo.");
                        }
                    }
                    finally
                    {
                        EndPagePrinter(printerHandle);
                    }
                }
                finally
                {
                    EndDocPrinter(printerHandle);
                }
            }
            finally
            {
                Marshal.FreeCoTaskMem(unmanagedBytes);
                ClosePrinter(printerHandle);
            }
        }

        private static void ThrowWin32(string message)
        {
            var code = Marshal.GetLastWin32Error();
            throw new InvalidOperationException(message + Environment.NewLine + "Codigo Windows: " + code);
        }
    }
}
