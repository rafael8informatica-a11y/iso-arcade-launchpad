package com.nebula2.emulador;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Locale;

/** One metadata query per directory; game data stays in the selected document tree. */
final class GameFolderScanner {
    static JSObject scan(ContentResolver resolver, Uri tree) throws Exception {
        String root = DocumentsContract.getTreeDocumentId(tree);
        String folderName = "Pasta de jogos";
        Uri rootUri = DocumentsContract.buildDocumentUriUsingTree(tree, root);
        try (Cursor c = resolver.query(rootUri,
                new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) folderName = c.getString(0);
        }
        JSArray files = new JSArray();
        ArrayDeque<String> queue = new ArrayDeque<>();
        HashSet<String> visited = new HashSet<>();
        queue.add(root);
        String[] columns = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        };
        while (!queue.isEmpty()) {
            String id = queue.removeFirst();
            if (!visited.add(id)) continue;
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id);
            try (Cursor c = resolver.query(children, columns, null, null, null)) {
                if (c == null) throw new Exception("A pasta não está disponível.");
                while (c.moveToNext()) {
                    String childId = c.getString(0);
                    String name = c.getString(1);
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                        queue.add(childId);
                    } else if (isGameFile(name)) {
                        JSObject file = new JSObject();
                        file.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, childId).toString());
                        file.put("name", name);
                        file.put("size", c.isNull(3) ? 0 : c.getLong(3));
                        files.put(file);
                    }
                }
            }
        }
        JSObject result = new JSObject();
        result.put("files", files);
        result.put("folderName", folderName);
        return result;
    }

    static boolean isGameFile(String name) {
        return name != null && name.toLowerCase(Locale.ROOT).matches(".*\\.(iso|bin|chd|cso|img|gz)$");
    }
}