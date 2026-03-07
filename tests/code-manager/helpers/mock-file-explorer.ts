
export class MockFileExplorer {
    private static nextSelection: string | null = null;
    private static constructorCalled = false;

    constructor(public config: any) {
        MockFileExplorer.constructorCalled = true;
    }

    static setNextSelection(path: string | null) {
        this.nextSelection = path;
    }

    async selectPath(): Promise<string | null> {
        return MockFileExplorer.nextSelection;
    }

    async selectFile(): Promise<string | null> {
        return MockFileExplorer.nextSelection;
    }
}
