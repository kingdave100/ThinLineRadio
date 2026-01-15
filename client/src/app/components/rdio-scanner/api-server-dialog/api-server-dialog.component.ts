import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { FormControl, Validators } from '@angular/forms';

@Component({
    standalone: false,
    selector: 'rdio-scanner-api-server-dialog',
    template: `
        <h2 mat-dialog-title>Configure API Server</h2>
        <mat-dialog-content>
            <p>Please enter the API server URL for all requests (login, access, etc.)</p>
            <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Server URL</mat-label>
                <input matInput [formControl]="serverUrlControl" placeholder="http://192.168.6.67:3000">
                <mat-error *ngIf="serverUrlControl.hasError('required')">
                    Server URL is required
                </mat-error>
            </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions>
            <button mat-raised-button color="primary" [disabled]="serverUrlControl.invalid" (click)="onSave()">
                Save
            </button>
        </mat-dialog-actions>
    `,
    styles: [`
        .full-width {
            width: 100%;
            margin-bottom: 16px;
        }
        mat-dialog-content {
            min-width: 400px;
            padding: 24px !important;
        }
        mat-dialog-title {
            margin: 0;
            padding: 24px 24px 16px 24px;
        }
        mat-dialog-actions {
            padding: 16px 24px;
            justify-content: flex-end;
        }
    `]
})
export class ApiServerDialogComponent {
    serverUrlControl = new FormControl('', [Validators.required]);

    constructor(public dialogRef: MatDialogRef<ApiServerDialogComponent>) {}

    onSave(): void {
        if (this.serverUrlControl.valid) {
            this.dialogRef.close(this.serverUrlControl.value);
        }
    }
}
