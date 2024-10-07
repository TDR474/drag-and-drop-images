import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("Image Upload Extension");
    outputChannel.appendLine('Activating Notebook Image Drop Extension');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('notebook-image-drop.openPanel', (cell: vscode.NotebookCell, imageUri?: string) => {
            outputChannel.appendLine('Command executed: notebook-image-drop.openPanel');
            openImagePanel(cell, imageUri, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('notebook-image-drop.resizeImage', (cell: vscode.NotebookCell) => {
            outputChannel.appendLine('Command executed: notebook-image-drop.resizeImage');
            resizeImageInCell(cell, context);
        })
    );

    // Register status bar items
    context.subscriptions.push(
        vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', {
            provideCellStatusBarItems: (cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] => {
                if (cell.kind === vscode.NotebookCellKind.Markup) {
                    const items: vscode.NotebookCellStatusBarItem[] = [];
                    const cellText = cell.document.getText();
                    const hasImage = /!\[.*\]\(.*\)|<img.*>/.test(cellText);
                    if (hasImage) {
                        const resizeItem = new vscode.NotebookCellStatusBarItem("Resize Image", vscode.NotebookCellStatusBarAlignment.Right);
                        resizeItem.command = { command: "notebook-image-drop.resizeImage", arguments: [cell], title: "Resize Image" };
                        items.push(resizeItem);
                    }
                    const uploadItem = new vscode.NotebookCellStatusBarItem("Upload Image", vscode.NotebookCellStatusBarAlignment.Right);
                    uploadItem.command = { command: "notebook-image-drop.openPanel", arguments: [cell], title: "Upload Image" };
                    items.push(uploadItem);
                    return items;
                }
                return [];
            }
        })
    );

    // Prevent the panel from opening automatically on activation
    vscode.window.registerWebviewPanelSerializer('imageUploadPanel', {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
            outputChannel.appendLine('Preventing panel restoration');
            webviewPanel.dispose();
        }
    });

    outputChannel.appendLine('Notebook Image Drop Extension is now active');
}

function openImagePanel(cell: vscode.NotebookCell, imageUri: string | undefined, context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'imageUploadPanel',
        imageUri ? 'Resize Image' : 'Upload and Adjust Image',
        vscode.ViewColumn.Three,  // Creates it beside the notebook
        {
            enableScripts: true,
            localResourceRoots: [
                context.extensionUri,
                vscode.Uri.file(path.dirname(cell.notebook.uri.fsPath))
            ]
        }
    );

    // Dynamically set the size of the panel's content via CSS
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, imageUri);
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'insertImage') {
            const { imageSrc, fileName, width, height, scaleType, centerImage, roundCorners } = message;
            
            if (!imageSrc) {
                vscode.window.showErrorMessage('No image data received');
                return;
            }
    
            await handleImageUpload(imageSrc, fileName, width, height, scaleType, centerImage, roundCorners, cell);
        }
    });
    
    // Optionally, you can also use panel.reveal() here to focus the panel after creation
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, imageUri?: string): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
    const imageWebviewUri = imageUri ? webview.asWebviewUri(vscode.Uri.file(imageUri)) : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload and Adjust Image</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #011627;
            color: #d4d7dd;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
            height: 100vh;
            overflow-y: auto;
        }
        .container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-width: 400px;
            margin: 0 auto;
        }
        #drop-zone {
            border: 3px dashed #82aaff;
            border-radius: 12px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: background-color 0.3s ease, border-color 0.3s ease;
        }
        #drop-zone.dragover {
            background-color: rgba(130, 170, 255, 0.2);
            border-color: #4fbcff;
        }
        #file-input {
            display: none;
        }
        .file-button {
            background-color: #4fbcff;
            color: #011627;
            padding: 10px 15px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            text-align: center;
            display: inline-block;
            width: auto;
            margin: 0 auto;
        }
        .file-button:hover {
            background-color: #82aaff;
            transform: translateY(-2px);
        }
        #image-preview {
            width: 100%;
            height: 200px;
            background-color: #022c43;
            border-radius: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        #preview {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .options {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        input[type="number"] {
            width: 80px;
            padding: 8px;
            border: 1px solid #4fbcff;
            border-radius: 6px;
            background-color: #022c43;
            color: #d4d7dd;
        }
        button {
            background-color: #4fbcff;
            color: #011627;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            width: 100%;
        }
        button:hover {
            background-color: #82aaff;
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <label for="file-input" class="file-button">Choose File</label>
        <input type="file" id="file-input" accept="image/*">
        
        <div id="drop-zone">
            <p>Drag & Drop your image here</p>
            <p>Supports JPG, PNG</p>
        </div>
        
        <button id="insert-button-top">Insert Image</button>
        
        <div class="options">
            <h3>Adjust Image Size:</h3>
            <label>
                <input type="radio" name="scaleType" value="auto" checked> Auto-resize
            </label>
            <label>
                <input type="radio" name="scaleType" value="custom"> Custom size
            </label>
            <div id="custom-size" style="display: none;">
                <label>Width: <input type="number" id="width" min="1" placeholder="px"></label>
                <label>Height: <input type="number" id="height" min="1" placeholder="px"></label>
            </div>
            <label>
                <input type="checkbox" id="center-image"> Center Image
            </label>
            <label>
                <input type="checkbox" id="round-corners"> Round Corners
            </label>
        </div>

        <div id="image-preview">
            <span class="placeholder" id="preview-placeholder">📷</span>
            <img id="preview" src="" alt="Preview" style="display: none;">
        </div>

        <button id="insert-button-bottom">Insert Image</button>
    </div>

<script>
(function() {
    const vscode = acquireVsCodeApi();
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const insertButtonTop = document.getElementById('insert-button-top');
    const insertButtonBottom = document.getElementById('insert-button-bottom');
    const previewPlaceholder = document.getElementById('preview-placeholder');
    const previewImage = document.getElementById('preview');
    const customSizeDiv = document.getElementById('custom-size'); // Custom size div
    const scaleTypeRadios = document.querySelectorAll('input[name="scaleType"]'); // Radio buttons

    let selectedFileData = ''; // Store base64 image data
    let originalWidth = 0, originalHeight = 0; // Store the original image dimensions
    let selectedFileName = ''; // Add this line to store the original filename

    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    insertButtonTop.addEventListener('click', handleInsert);
    insertButtonBottom.addEventListener('click', handleInsert);

    // Add event listeners for scale type radio buttons to toggle custom size input visibility
    scaleTypeRadios.forEach((radio) => {
        radio.addEventListener('change', function() {
            if (radio.value === 'custom' && radio.checked) {
                customSizeDiv.style.display = 'block'; // Show custom size inputs
            } else {
                customSizeDiv.style.display = 'none'; // Hide custom size inputs
            }
        });
    });

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            selectedFileName = file.name; // Store the original filename
            displayPreview(file);
        }
    }

    function handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add('dragover');
    }

    function handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('dragover');
    }

    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('dragover');

        const file = event.dataTransfer.files[0];
        if (file) {
            displayPreview(file);
        }
    }

    function displayPreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedFileData = e.target.result; // Store the base64 image data
            previewPlaceholder.style.display = 'none';
            previewImage.style.display = 'block';
            previewImage.src = selectedFileData;

            // Create an image object to get its original dimensions
            const img = new Image();
            img.onload = function() {
                originalWidth = img.width;
                originalHeight = img.height;
            };
            img.src = selectedFileData;
        };
        reader.readAsDataURL(file);
    }

    function handleInsert() {
        if (!selectedFileData) {
            vscode.postMessage({
                command: 'showError',
                message: 'Please select an image first.'
            });
            return;
        }

        const scaleType = document.querySelector('input[name="scaleType"]:checked').value;
        let width, height;

        if (scaleType === 'custom') {
            width = document.getElementById('width').value || 'auto';
            height = document.getElementById('height').value || 'auto';
        } else {
            // Set default width to 300px and scale height accordingly
            width = 340;
            height = (originalHeight / originalWidth) * 340;
        }

        const centerImage = document.getElementById('center-image').checked;
        const roundCorners = document.getElementById('round-corners').checked;
        
        vscode.postMessage({
            command: 'insertImage',
            imageSrc: selectedFileData,
            fileName: selectedFileName, // Pass the original filename
            width: width,
            height: height,
            scaleType: scaleType,
            centerImage: centerImage,
            roundCorners: roundCorners
        });
    }
})();
</script>


</body>
</html>`
;
}

async function handleImageUpload(
    imageData: string,
    fileName: string,
    width: number | string,
    height: number | string,
    scaleType: string,
    centerImage: boolean,
    roundCorners: boolean,
    cell: vscode.NotebookCell
) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    const imagesFolder = path.join(workspaceFolder.uri.fsPath, 'images');
    if (!fs.existsSync(imagesFolder)) {
        fs.mkdirSync(imagesFolder);
    }

    // Generate a unique filename
    let fileIndex = 0;
    let newFilePath: string;
    const fileExt = path.extname(fileName);
    const fileNameWithoutExt = path.basename(fileName, fileExt);
    do {
        if (fileIndex === 0) {
            newFilePath = path.join(imagesFolder, fileName);
        } else {
            newFilePath = path.join(imagesFolder, `${fileNameWithoutExt}_${fileIndex}${fileExt}`);
        }
        fileIndex++;
    } while (fs.existsSync(newFilePath));

    const finalFileName = path.basename(newFilePath);

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFileSync(newFilePath, buffer);

    const relativePath = path.relative(workspaceFolder.uri.fsPath, newFilePath).replace(/\\/g, '/');

    // Build the style string based on options
    let styleAttributes = `width="${width}" height="${height}"`;

    if (centerImage && roundCorners) {
        styleAttributes = `width="${width}" height="${height}" style="display: block; margin-left: auto; margin-right: auto; border-radius: 8px;"`;
    } else if (centerImage) {
        styleAttributes = `width="${width}" height="${height}" style="display: block; margin-left: auto; margin-right: auto;"`;
    } else if (roundCorners) {
        styleAttributes = `width="${width}" height="${height}" style="border-radius: 8px;"`;
    }

    // Always use the <img> tag with width and height
    const markdownImageSyntax = `<img src="${relativePath}" ${styleAttributes} />`;

    const edit = new vscode.WorkspaceEdit();
    const newContent = cell.document.getText() + '\n' + markdownImageSyntax;
    edit.replace(cell.document.uri, new vscode.Range(0, 0, cell.document.lineCount, 0), newContent);

    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage(`Image uploaded and inserted as ${finalFileName} successfully!`);
}

async function handleImageResize(
    width: number,
    height: number,
    imageUri: string,
    centerImage: boolean,
    roundCorners: boolean,
    cell: vscode.NotebookCell
) {
    outputChannel.appendLine(`Handling image resize: ${imageUri}, ${width}x${height}, Center: ${centerImage}, Round: ${roundCorners}`);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    const imagePath = vscode.Uri.parse(imageUri).fsPath;

    // Check if the imagePath is a file
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file does not exist: ${imagePath}`);
    }

    const stat = fs.statSync(imagePath);
    if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${imagePath}`);
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, imagePath).replace(/\\/g, '/');

    // Build the style string based on options
    let styleAttributes = `width="${width}" height="${height}"`;
    if (centerImage) {
        styleAttributes += ` style="display: block; margin-left: auto; margin-right: auto;"`;
    }
    if (roundCorners) {
        styleAttributes += ` style="${centerImage ? 'display: block; margin-left: auto; margin-right: auto;' : ''} border-radius: 8px;"`;
    }

    const markdownImageSyntax = `<img src="${relativePath}" ${styleAttributes} />`;

    outputChannel.appendLine(`Updating markdown with resized image: ${markdownImageSyntax}`);

    const cellText = cell.document.getText();
    const imageRegex = new RegExp(`(!\\[.*?\\]\\(${escapeRegExp(relativePath)}\\))|(<img[^>]*src=["']${escapeRegExp(relativePath)}["'][^>]*>)`, 'g');

    const newCellText = cellText.replace(imageRegex, markdownImageSyntax);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(cell.document.uri, new vscode.Range(0, 0, cell.document.lineCount, 0), newCellText);

    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage('Image resized successfully!');
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-z0-9\.\-_]/gi, '_').toLowerCase();
}

async function resizeImageInCell(cell: vscode.NotebookCell, context: vscode.ExtensionContext) {
    const cellText = cell.document.getText();
    const imageRegex = /!\[.*?\]\((.*?)\)|<img[^>]*src=["'](.*?)["'][^>]*>/g;
    const images: string[] = [];
    let match;
    while ((match = imageRegex.exec(cellText)) !== null) {
        images.push(match[1] || match[2]);
    }

    if (images.length === 0) {
        vscode.window.showInformationMessage('No images found in this cell.');
        return;
    }

    let imageToResize = images[0];
    if (images.length > 1) {
        const selected = await vscode.window.showQuickPick(images, { placeHolder: 'Select an image to resize' });
        if (!selected) {
            return;
        }
        imageToResize = selected;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const imagePath = path.join(workspaceFolder.uri.fsPath, imageToResize);

    // Check if imagePath is a file
    if (!fs.existsSync(imagePath)) {
        vscode.window.showErrorMessage(`Image file does not exist: ${imageToResize}`);
        return;
    }

    const stat = fs.statSync(imagePath);
    if (!stat.isFile()) {
        vscode.window.showErrorMessage(`Path is not a file: ${imageToResize}`);
        return;
    }

    openImagePanel(cell, imagePath, context);
}

export function deactivate() {
    outputChannel.appendLine('Deactivating Notebook Image Drop Extension');
}
