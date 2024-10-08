import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;

// Global variable to keep track of the last selected cell
let lastSelectedCell: vscode.NotebookCell | undefined;

export function activate(context: vscode.ExtensionContext) {
    // outputChannel = vscode.window.createOutputChannel("Image Upload Extension");
    // outputChannel.appendLine('Activating Notebook Image Drop Extension');

    // Initialize lastSelectedCell if possible
    if (vscode.window.activeNotebookEditor && vscode.window.activeNotebookEditor.selection) {
        const selection = vscode.window.activeNotebookEditor.selection;
        lastSelectedCell = vscode.window.activeNotebookEditor.notebook.cellAt(selection.start);
    } else {
        lastSelectedCell = undefined;
    }

    // Event listener for notebook editor selection changes
    vscode.window.onDidChangeNotebookEditorSelection((e) => {
        if (e.selections && e.selections.length > 0) {
            const selection = e.selections[0];
            if (e.notebookEditor) {
                lastSelectedCell = e.notebookEditor.notebook.cellAt(selection.start);
                // outputChannel.appendLine(`Selection changed. Last selected cell index: ${lastSelectedCell.index}`);
            }
        }
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('notebook-image-drop.openPanel', (cell: vscode.NotebookCell, imageUri?: string) => {
            // outputChannel.appendLine('Command executed: notebook-image-drop.openPanel');
            openImagePanel(cell, imageUri, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('notebook-image-drop.resizeImage', (cell: vscode.NotebookCell) => {
            // outputChannel.appendLine('Command executed: notebook-image-drop.resizeImage');
            resizeImageInCell(cell, context);
        })
    );

    // Register status bar items
    context.subscriptions.push(
        vscode.notebooks.registerNotebookCellStatusBarItemProvider('*', {
            provideCellStatusBarItems: (cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] => {
                if (cell.kind === vscode.NotebookCellKind.Markup) {
                    const items: vscode.NotebookCellStatusBarItem[] = [];
                    const cellText = cell.document.getText();
                    const hasImage = /<img.*?>/.test(cellText);
                    if (hasImage) {
                        const resizeItem = new vscode.NotebookCellStatusBarItem("Resize Image", vscode.NotebookCellStatusBarAlignment.Right);
                        resizeItem.command = { command: "notebook-image-drop.resizeImage", arguments: [cell], title: "Resize Image" };
                        items.push(resizeItem);
                    }
                    const uploadItem = new vscode.NotebookCellStatusBarItem("📷 Image", vscode.NotebookCellStatusBarAlignment.Right);
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
            // outputChannel.appendLine('Preventing panel restoration');
            webviewPanel.dispose();
        }
    });

    // outputChannel.appendLine('Notebook Image Drop Extension is now active');
}

function openImagePanel(cell: vscode.NotebookCell, imageUri: string | undefined, context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'imageUploadPanel',
        imageUri ? 'Resize Image' : 'Upload and Adjust Image',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [
                context.extensionUri,
                vscode.Uri.file(path.dirname(cell.notebook.uri.fsPath)),
                vscode.Uri.joinPath(context.extensionUri, 'media') // Include media folder
            ]
        }
    );


    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, imageUri);

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'insertImage') {
            const { imageSrc, fileName, width, height, scaleType, centerImage, roundCorners, imageTitle, addImageTitle } = message;

            if (!imageSrc && !message.imageUri) {
                vscode.window.showErrorMessage('No image data received');
                return;
            }

            if (message.isResize) {
                // Handle resizing existing image
                await handleImageResize(
                    width,
                    height,
                    message.imageUri,
                    centerImage,
                    roundCorners,
                    imageTitle,
                    addImageTitle,
                    lastSelectedCell
                );
            } else {
                // Handle new image upload
                await handleImageUpload(
                    imageSrc,
                    fileName,
                    width,
                    height,
                    scaleType,
                    centerImage,
                    roundCorners,
                    imageTitle,
                    addImageTitle
                );
            }
        }
    });
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, imageUri?: string): string {
    const nonce = getNonce();

    const imageWebviewUri = imageUri ? webview.asWebviewUri(vscode.Uri.file(imageUri)) : '';
    const isResize = !!imageUri;

    // Get URIs for the Cropper.js and CSS
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'cropper.min.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'cropper.min.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Meta and title -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isResize ? 'Resize Image' : 'Upload and Adjust Image'}</title>
    <!-- Include the Cropper.js CSS -->
    <link href="${styleUri}" rel="stylesheet" />
    <style>
        /* CSS styles */
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
            position: relative;
        }
        #preview {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        /* Adjust the preview placeholder size */
        #preview-placeholder {
            font-size: 60px;
            text-align: center;
        }
.crop-button {
    background-color: #82aaff;
    border: none;
    color: #011627;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    position: absolute;
    top: 10px; /* Position near the top */
    right: 10px; /* Position near the right */
    padding: 4px 5px;
    transition: background-color 0.3s ease;
    width: 40px;
    height: 20px;

}

.crop-button:hover {
    background-color: #4fbcff;
}
        .options {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        input[type="number"],
        input[type="text"] {
            width: 100%;
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
        /* Cropper.js styles */
        .cropper-container {
            position: absolute !important;
            top: 0;
            left: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        ${isResize ? '' : `
        <label for="file-input" class="file-button">Choose File</label>
        <input type="file" id="file-input" accept="image/*">
        
        <div id="drop-zone">
            <p>Drag, Press [SHIFT], & Drop </p>
            <p>your image here</p>
        </div>
        
        <button id="insert-button-top">Insert Image</button>
        `}
        
        <div class="options">
            <h3>${isResize ? 'Adjust Image Parameters:' : 'Adjust Image Size:'}</h3>
            <label>
                <input type="checkbox" id="add-image-title"> Add Image Title
            </label>
            <div id="image-title-container" style="display: none;">
                <label>
                    Title:
                    <input type="text" id="image-title" placeholder="Enter image title">
                </label>
            </div>
            <label>
                <input type="radio" name="scaleType" value="auto" checked> Auto-resize
            </label>
            <label>
                <input type="radio" name="scaleType" value="custom"> Custom size
            </label>
            <div id="custom-size" style="display: none;">
                <label>Width: <input type="number" id="width" min="1" placeholder="Width in px"></label>
                <label>Height: <input type="number" id="height" min="1" placeholder="Height in px"></label>
                <!-- Added checkbox for scaling proportionally -->
                <label>
                    <input type="checkbox" id="scale-proportionally" checked> Scale proportionally
                </label>
            </div>
            <label>
                <input type="checkbox" id="center-image" checked> Center Image
            </label>
            <label>
                <input type="checkbox" id="round-corners" checked> Round Corners
            </label>
        </div>

        <div id="image-preview">
            <span class="placeholder" id="preview-placeholder">📷</span>
            <img id="preview" src="" alt="Preview" style="display: none;">
            <button class="crop-button" id="crop-button">Crop</button>
        </div>

        <button id="insert-button-bottom">${isResize ? 'Update Image' : 'Insert Image'}</button>
    </div>

<script nonce="${nonce}" src="${scriptUri}"></script>
<script nonce="${nonce}">
(function() {
    const vscode = acquireVsCodeApi();
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const insertButtonTop = document.getElementById('insert-button-top');
    const insertButtonBottom = document.getElementById('insert-button-bottom');
    const previewPlaceholder = document.getElementById('preview-placeholder');
    const previewImage = document.getElementById('preview');
    const customSizeDiv = document.getElementById('custom-size');
    const scaleTypeRadios = document.querySelectorAll('input[name="scaleType"]');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const scaleProportionallyCheckbox = document.getElementById('scale-proportionally');
    const cropButton = document.getElementById('crop-button');
    const imageTitleInput = document.getElementById('image-title');
    const addImageTitleCheckbox = document.getElementById('add-image-title');
    const imageTitleContainer = document.getElementById('image-title-container');

    let selectedFileData = '';
    let originalWidth = 0, originalHeight = 0;
    let aspectRatio = 1;
    let selectedFileName = '';
    let isResize = ${isResize};
    let croppedImageData = '';
    let cropper = null;

    ${isResize ? `let imageUri = "${imageWebviewUri}";` : ''}

    if (isResize) {
        initializeResizeMode();
    } else {
        fileInput.addEventListener('change', handleFileSelect);
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
        insertButtonTop.addEventListener('click', handleInsert);
    }
    insertButtonBottom.addEventListener('click', handleInsert);

    cropButton.addEventListener('click', handleCrop);

    addImageTitleCheckbox.addEventListener('change', function() {
        if (addImageTitleCheckbox.checked) {
            imageTitleContainer.style.display = 'block';
        } else {
            imageTitleContainer.style.display = 'none';
        }
    });

    function initializeResizeMode() {
        // Hide upload controls
        if (dropZone) dropZone.style.display = 'none';
        if (fileInput) fileInput.style.display = 'none';
        if (insertButtonTop) insertButtonTop.style.display = 'none';
        if (document.querySelector('.file-button')) document.querySelector('.file-button').style.display = 'none';

        // Display the image
        previewPlaceholder.style.display = 'none';
        previewImage.style.display = 'block';
        previewImage.src = imageUri;

        const img = new Image();
        img.onload = function() {
            originalWidth = img.width;
            originalHeight = img.height;
            aspectRatio = originalWidth / originalHeight;
            updateCustomSizeInputs();
        };
        img.src = imageUri;
    }

    scaleTypeRadios.forEach((radio) => {
        radio.addEventListener('change', function() {
            if (radio.value === 'custom' && radio.checked) {
                customSizeDiv.style.display = 'block';
            } else {
                customSizeDiv.style.display = 'none';
                widthInput.value = '';
                heightInput.value = '';
            }
            updateCustomSizeInputs();
        });
    });

    scaleProportionallyCheckbox.addEventListener('change', function() {
        // Update height based on current width if scaling proportionally is checked
        if (scaleProportionallyCheckbox.checked && widthInput.value) {
            const width = parseFloat(widthInput.value);
            if (width && !isNaN(width)) {
                const newHeight = Math.round(width / aspectRatio);
                heightInput.value = newHeight;
            }
        }
    });

    widthInput.addEventListener('input', function() {
        if (scaleProportionallyCheckbox.checked && originalWidth && originalHeight) {
            const width = parseFloat(widthInput.value);
            if (width && !isNaN(width)) {
                const newHeight = Math.round(width / aspectRatio);
                heightInput.value = newHeight;
            }
        }
    });

    heightInput.addEventListener('input', function() {
        if (scaleProportionallyCheckbox.checked && originalWidth && originalHeight) {
            const height = parseFloat(heightInput.value);
            if (height && !isNaN(height)) {
                const newWidth = Math.round(height * aspectRatio);
                widthInput.value = newWidth;
            }
        }
    });

    function updateCustomSizeInputs() {
        if (document.querySelector('input[name="scaleType"][value="custom"]').checked) {
            if (originalWidth && originalHeight) {
                widthInput.value = originalWidth;
                heightInput.value = originalHeight;
            } else {
                widthInput.value = '';
                heightInput.value = '';
            }
        }
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            selectedFileName = file.name;
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
            selectedFileName = file.name;
            displayPreview(file);
        }
    }

    function displayPreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedFileData = e.target.result;
            croppedImageData = selectedFileData; // Initialize with the original image data
            previewPlaceholder.style.display = 'none';
            previewImage.style.display = 'block';
            previewImage.src = selectedFileData;

            const img = new Image();
            img.onload = function() {
                originalWidth = img.width;
                originalHeight = img.height;
                aspectRatio = originalWidth / originalHeight;
                updateCustomSizeInputs();
            };
            img.src = selectedFileData;
        };
        reader.readAsDataURL(file);
    }

    function handleCrop() {
    // Check if an image is loaded
    if (!previewImage.src || previewImage.src === window.location.href) {
        // No image is loaded, do nothing
        return;
    }

    if (cropper) {
        // If cropper is already active, get the cropped image data
        const canvas = cropper.getCroppedCanvas();
        const croppedDataUrl = canvas.toDataURL();
        croppedImageData = croppedDataUrl;
        previewImage.src = croppedDataUrl;

        // Destroy the cropper instance
        cropper.destroy();
        cropper = null;
        cropButton.textContent = 'Crop';
        cropButton.classList.remove('cropping');

        // Update original dimensions and aspect ratio
        const img = new Image();
        img.onload = function () {
            originalWidth = img.width;
            originalHeight = img.height;
            aspectRatio = originalWidth / originalHeight;
            updateCustomSizeInputs();
        };
        img.src = croppedDataUrl;
    } else {
        // Initialize the cropper
        cropper = new Cropper(previewImage, {
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            modal: true,
            guides: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            responsive: true,
            background: false,
        });
        cropButton.textContent = 'Done';
        cropButton.classList.add('cropping');
    }
}

    function handleInsert() {
        if (!isResize && !selectedFileData) {
            vscode.postMessage({
                command: 'showError',
                message: 'Please select an image first.'
            });
            return;
        }

        const scaleType = document.querySelector('input[name="scaleType"]:checked').value;
        let width, height;

        if (scaleType === 'custom') {
            width = widthInput.value.trim() || 'auto';
            height = heightInput.value.trim() || 'auto';
        } else {
            // Set default width to 340px and scale height accordingly
            width = 340;
            height = Math.round((originalHeight / originalWidth) * 340);
        }

        const centerImage = document.getElementById('center-image').checked;
        const roundCorners = document.getElementById('round-corners').checked;
        const imageTitle = addImageTitleCheckbox.checked ? imageTitleInput.value.trim() : '';
        const addImageTitle = addImageTitleCheckbox.checked;

        vscode.postMessage({
            command: 'insertImage',
            imageSrc: isResize ? null : (croppedImageData || selectedFileData),
            imageUri: isResize ? imageUri : null,
            fileName: selectedFileName,
            width: width,
            height: height,
            scaleType: scaleType,
            centerImage: centerImage,
            roundCorners: roundCorners,
            imageTitle: imageTitle,
            addImageTitle: addImageTitle,
            isResize: isResize
        });
    }
})();
</script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function handleImageUpload(
    imageData: string,
    fileName: string,
    width: number | string,
    height: number | string,
    scaleType: string,
    centerImage: boolean,
    roundCorners: boolean,
    imageTitle: string,
    addImageTitle: boolean
) {
    // Use the last selected cell
    const cell = lastSelectedCell;
    if (!cell) {
        vscode.window.showErrorMessage('Unable to retrieve the target cell. Please select a cell in the notebook.');
        return;
    }

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
    const fileExt = path.extname(fileName || 'image.png');
    const fileNameWithoutExt = path.basename(fileName || 'image', fileExt);
    do {
        if (fileIndex === 0) {
            newFilePath = path.join(imagesFolder, fileName || 'image.png');
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
    let styleAttributes = '';

    if (width && height) {
        styleAttributes += `width="${width}" height="${height}"`;
    } else {
        styleAttributes += `width="${width || 'auto'}" height="${height || 'auto'}"`;
    }

    let styleString = '';
    if (centerImage) {
        styleString += 'display: block; margin-left: auto; margin-right: auto;';
    }
    if (roundCorners) {
        styleString += ' border-radius: 8px;';
    }
    if (styleString) {
        styleAttributes += ` style="${styleString.trim()}"`;
    }

    // Use the <img> tag
    const markdownImageSyntax = `<img src="${relativePath}" ${styleAttributes} />`;

    // If image title is provided, add it below the image, centered
    let fullContent = markdownImageSyntax;
    if (addImageTitle && imageTitle) {
        fullContent += `\n<div style="text-align: center; margin-top: 10px;"><b><i>${escapeHtml(imageTitle)}</i></b></div>`;

    }

    const edit = new vscode.WorkspaceEdit();
    const newContent = cell.document.getText() + '\n' + fullContent;
    edit.replace(
        cell.document.uri,
        new vscode.Range(0, 0, cell.document.lineCount, 0),
        newContent
    );

    await vscode.workspace.applyEdit(edit);

    // vscode.window.showInformationMessage(`Image uploaded and inserted as ${finalFileName} successfully!`);
}

async function handleImageResize(
    width: number | string,
    height: number | string,
    imageUri: string,
    centerImage: boolean,
    roundCorners: boolean,
    imageTitle: string,
    addImageTitle: boolean,
    cell: vscode.NotebookCell | undefined
) {
    if (!cell) {
        vscode.window.showErrorMessage('No cell selected to resize the image.');
        return;
    }

    // outputChannel.appendLine(`Handling image resize: ${imageUri}, ${width}x${height}, Center: ${centerImage}, Round: ${roundCorners}`);

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
    let styleAttributes = '';

    if (width && height) {
        styleAttributes += `width="${width}" height="${height}"`;
    } else {
        styleAttributes += `width="${width || 'auto'}" height="${height || 'auto'}"`;
    }

    let styleString = '';
    if (centerImage) {
        styleString += 'display: block; margin-left: auto; margin-right: auto;';
    }
    if (roundCorners) {
        styleString += ' border-radius: 8px;';
    }
    if (styleString) {
        styleAttributes += ` style="${styleString.trim()}"`;
    }

    // Use the <img> tag
    const markdownImageSyntax = `<img src="${relativePath}" ${styleAttributes} />`;

    // If image title is provided, add it below the image, centered
    let fullContent = markdownImageSyntax;
    if (addImageTitle && imageTitle) {
        fullContent += `\n<div style="text-align: center;">${escapeHtml(imageTitle)}</div>`;
    }

    // outputChannel.appendLine(`Updating markdown with resized image: ${markdownImageSyntax}`);

    const cellText = cell.document.getText();
    const imageRegex = new RegExp(`(<img[^>]*src=["']${escapeRegExp(relativePath)}["'][^>]*>(?:\\n<div[^>]*>.*?</div>)?)`, 'g');

    const newCellText = cellText.replace(imageRegex, fullContent);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(cell.document.uri, new vscode.Range(0, 0, cell.document.lineCount, 0), newCellText);

    await vscode.workspace.applyEdit(edit);

    // vscode.window.showInformationMessage('Image resized successfully!');
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string) {
    return str.replace(/[&<>"']/g, function(m) {
        switch (m) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#039;';
                default:
                    return m;
        }
    });
}

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-z0-9\.\-_]/gi, '_').toLowerCase();
}

async function resizeImageInCell(cell: vscode.NotebookCell, context: vscode.ExtensionContext) {
    const cellText = cell.document.getText();
    const imageRegex = /<img[^>]*src=["'](.*?)["'][^>]*>/g;
    const images: string[] = [];
    let match;
    while ((match = imageRegex.exec(cellText)) !== null) {
        images.push(match[1]);
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

    // Pass the cell to ensure the image is updated in the right cell
    openImagePanel(cell, imagePath, context);
}

export function deactivate() {
    // outputChannel.appendLine('Deactivating Notebook Image Drop Extension');
}