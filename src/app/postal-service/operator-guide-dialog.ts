import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { OperatorGuide } from './operator-guide';

export interface OperatorGuideData {
    /** Operator name shown as the title, e.g. "switchMap". */
    name: string;
    /** What kind of card it comes from, e.g. "Sorting operator". */
    kind: string;
    code: string;
    guide: OperatorGuide;
}

/** The "?" dialog of a card: what the operator does, where to read more, and how to see it here. */
@Component({
    selector: 'app-operator-guide-dialog',
    imports: [MatButtonModule, MatDialogModule, MatIconModule],
    styles: `
        .guide__kind {
            font: var(--mat-sys-label-medium);
            color: var(--mat-sys-on-surface-variant);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .guide__name {
            font-family: var(--app-font-mono);
        }
        .guide__section {
            margin: 1.25rem 0 0.5rem;
            font: var(--mat-sys-title-small);
            color: var(--mat-sys-on-surface);
        }
        .guide__text {
            margin: 0 0 0.5rem;
        }
        .guide__code {
            display: block;
            margin-top: 0.75rem;
            padding: 0.5rem 0.625rem;
            font-family: var(--app-font-mono);
            font-size: 0.8125rem;
            border-radius: var(--mat-sys-corner-medium);
            background: var(--mat-sys-surface-container-high);
            color: var(--mat-sys-on-surface);
            white-space: pre-wrap;
            word-break: break-word;
        }
        .guide__steps {
            margin: 0;
            padding-left: 1.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }
        .guide__docs {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        .guide__link {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            color: var(--mat-sys-primary);
            font-weight: 600;
        }
        .guide__link mat-icon {
            width: 1rem;
            height: 1rem;
            font-size: 1rem;
        }
    `,
    template: `
        <h2 mat-dialog-title>
            <span class="guide__kind">{{ data.kind }}</span><br />
            <span class="guide__name">{{ data.name }}</span>
        </h2>
        <mat-dialog-content>
            @for (paragraph of data.guide.about; track $index) {
                <p class="guide__text">{{ paragraph }}</p>
            }
            <code class="guide__code">{{ data.code }}</code>

            <h3 class="guide__section">Try it in the postal service</h3>
            <ol class="guide__steps">
                @for (step of data.guide.scenario; track $index) {
                    <li>{{ step }}</li>
                }
            </ol>

            <h3 class="guide__section">Official documentation</h3>
            <ul class="guide__docs">
                @for (doc of data.guide.docs; track doc.url) {
                    <li>
                        <a class="guide__link" [href]="doc.url" target="_blank" rel="noopener">
                            {{ doc.label }}
                            <mat-icon fontSet="material-symbols-outlined" aria-hidden="true">open_in_new</mat-icon>
                        </a>
                    </li>
                }
            </ul>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>Close</button>
        </mat-dialog-actions>
    `,
})
export class OperatorGuideDialog {
    readonly data = inject<OperatorGuideData>(MAT_DIALOG_DATA);
}
